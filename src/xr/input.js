// Copyright 2026 IoTone, Inc.
// This source code is licensed under the MIT License (see LICENSE.txt).

import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();
const mouse = new THREE.Vector2();
const interactables = new Set();

let controllers = [];
let hands = [];
let hoveredMap = new Map();
let storedCamera = null;

// Drag state (mouse or controller or hand)
let dragState = null;

// Hand drag state — separate per hand so both hands work independently
const handDragStates = [null, null];

// Resize state — per hand
const handResizeStates = [null, null];

// Finger poke state — track which button each fingertip is inside to avoid repeat fires
const pokedButtons = [new Set(), new Set()];

// Temp vectors for hand calculations
const _indexPos = new THREE.Vector3();
const _thumbPos = new THREE.Vector3();
const _pinchMid = new THREE.Vector3();
const _prevPinchPos = [new THREE.Vector3(), new THREE.Vector3()];
const _pokeOrigin = new THREE.Vector3();
const _pokeSphere = new THREE.Sphere(new THREE.Vector3(), 0.015);

export function registerInteractable(mesh) {
  interactables.add(mesh);
}

export function unregisterInteractable(mesh) {
  interactables.delete(mesh);
}

export function initInput(renderer, scene, camera) {
  storedCamera = camera;
  const handModelFactory = new XRHandModelFactory();

  for (let i = 0; i < 2; i++) {
    const controller = renderer.xr.getController(i);
    scene.add(controller);

    const lineGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -3),
    ]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.6 });
    controller.add(new THREE.Line(lineGeom, lineMat));

    controller.addEventListener('selectstart', () => onSelectStart(controller));
    controller.addEventListener('selectend', () => onSelectEnd(controller));
    controllers.push(controller);

    const grip = renderer.xr.getControllerGrip(i);
    scene.add(grip);

    const hand = renderer.xr.getHand(i);
    hand.add(handModelFactory.createHandModel(hand, 'mesh'));
    scene.add(hand);
    hands.push(hand);
  }

  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (e) => onPointerDown(e, canvas));
  canvas.addEventListener('pointermove', (e) => onPointerMove(e, canvas));
  canvas.addEventListener('pointerup', () => onPointerUp(canvas));
  canvas.addEventListener('wheel', (e) => onWheel(e, canvas), { passive: false });
}

// Scroll listeners — panels can register to receive scroll events
const scrollListeners = new Map(); // mesh -> { onScrollUp, onScrollDown }
export function registerScrollable(mesh, callbacks) {
  scrollListeners.set(mesh, callbacks);
}
export function unregisterScrollable(mesh) {
  scrollListeners.delete(mesh);
}

function getInteractableList() {
  return [...interactables];
}

function findParentButton(obj) {
  let current = obj;
  while (current) {
    if (current.userData?.isButton) return current;
    current = current.parent;
  }
  return null;
}

function findDragHandle(obj) {
  let current = obj;
  while (current) {
    if (current.userData?.isDragHandle) return current;
    current = current.parent;
  }
  return null;
}

function findResizeHandle(obj) {
  let current = obj;
  while (current) {
    if (current.userData?.isResizeHandle) return current;
    current = current.parent;
  }
  return null;
}

// --- XR Controller events ---

function onSelectStart(source) {
  const hovered = hoveredMap.get(source);
  if (!hovered) return;

  // Check drag handle first
  const handle = findDragHandle(hovered);
  if (handle && handle.userData.panel) {
    const panel = handle.userData.panel;
    dragState = { panel, source: 'controller', controller: source };
    return;
  }

  const btn = findParentButton(hovered);
  if (btn?.userData.onSelectStart) btn.userData.onSelectStart();
}

function onSelectEnd(source) {
  if (dragState && dragState.source === 'controller') {
    dragState = null;
    return;
  }

  const hovered = hoveredMap.get(source);
  if (!hovered) return;
  const btn = findParentButton(hovered);
  if (btn?.userData.onSelectEnd) btn.userData.onSelectEnd();
}

// --- Per-frame update ---

export function updateInput(renderer, frame) {
  const targets = getInteractableList();
  if (targets.length === 0) return;

  // Controller raycasting
  for (const controller of controllers) {
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    const intersects = raycaster.intersectObjects(targets, false);
    const prevHovered = hoveredMap.get(controller);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      if (hit !== prevHovered) {
        if (prevHovered) {
          const prevBtn = findParentButton(prevHovered);
          if (prevBtn?.userData.onHoverEnd) prevBtn.userData.onHoverEnd();
        }
        hoveredMap.set(controller, hit);
        const btn = findParentButton(hit);
        if (btn?.userData.onHoverStart) btn.userData.onHoverStart();
      }

      // XR controller drag
      if (dragState && dragState.source === 'controller' && dragState.controller === controller) {
        const point = intersects[0].point;
        dragState.panel.position.x = point.x;
        dragState.panel.position.y = point.y;
      }
    } else if (prevHovered) {
      const prevBtn = findParentButton(prevHovered);
      if (prevBtn?.userData.onHoverEnd) prevBtn.userData.onHoverEnd();
      hoveredMap.delete(controller);
    }
  }

  // Hand tracking: pinch grab/drag/resize + finger poke
  if (frame) {
    const session = renderer.xr.getSession();
    const refSpace = renderer.xr.getReferenceSpace();
    if (!session || !refSpace) return;

    // Build a list of hand input sources matched to our hands array
    const handSources = [];
    for (const src of session.inputSources) {
      if (src.hand) handSources.push(src);
    }

    for (let i = 0; i < Math.min(handSources.length, hands.length); i++) {
      const hand = hands[i];
      const inputSource = handSources[i];

      const indexTipJoint = inputSource.hand.get('index-finger-tip');
      const thumbTipJoint = inputSource.hand.get('thumb-tip');
      if (!indexTipJoint || !thumbTipJoint) continue;

      const indexPose = frame.getJointPose(indexTipJoint, refSpace);
      const thumbPose = frame.getJointPose(thumbTipJoint, refSpace);
      if (!indexPose || !thumbPose) continue;

      const ip = indexPose.transform.position;
      const tp = thumbPose.transform.position;
      _indexPos.set(ip.x, ip.y, ip.z);
      _thumbPos.set(tp.x, tp.y, tp.z);
      _pinchMid.lerpVectors(_indexPos, _thumbPos, 0.5);

      const pinchDist = _indexPos.distanceTo(_thumbPos);
      const wasPinching = hand.userData.pinching || false;
      const isPinching = pinchDist < 0.025;

      // --- PINCH START ---
      if (isPinching && !wasPinching) {
        // Raycast from pinch midpoint forward to find what we're grabbing
        raycaster.ray.origin.copy(_pinchMid);
        raycaster.ray.direction.set(0, 0, -1);
        const intersects = raycaster.intersectObjects(targets, false);

        if (intersects.length > 0) {
          const hit = intersects[0].object;

          // Check resize handle first
          const resizeHandle = findResizeHandle(hit);
          if (resizeHandle?.userData.panel) {
            handResizeStates[i] = {
              panel: resizeHandle.userData.panel,
              corner: resizeHandle.userData.corner,
              startPinch: _pinchMid.clone(),
              startWidth: resizeHandle.userData.panel.panelWidth,
              startHeight: resizeHandle.userData.panel.panelHeight,
            };
            _prevPinchPos[i].copy(_pinchMid);
            hand.userData.pinching = true;
            continue;
          }

          // Check drag handle
          const handle = findDragHandle(hit);
          if (handle?.userData.panel) {
            const panel = handle.userData.panel;
            const offset = new THREE.Vector3().subVectors(panel.position, _pinchMid);
            handDragStates[i] = { panel, offset };
            if (handle.userData.onHoverStart) handle.userData.onHoverStart();
            _prevPinchPos[i].copy(_pinchMid);
            hand.userData.pinching = true;
            continue;
          }

          // Otherwise it's a button pinch-click
          const btn = findParentButton(hit);
          if (btn) {
            if (btn.userData.onSelectStart) btn.userData.onSelectStart();
            setTimeout(() => {
              if (btn.userData.onSelectEnd) btn.userData.onSelectEnd();
            }, 100);
          }
        }
      }

      // --- PINCH HOLD (drag / resize) ---
      if (isPinching && wasPinching) {
        if (handDragStates[i]) {
          const ds = handDragStates[i];
          ds.panel.position.copy(_pinchMid).add(ds.offset);
        }
        if (handResizeStates[i]) {
          const rs = handResizeStates[i];
          // Compute delta in panel's local space so rotation is accounted for
          const worldDelta = new THREE.Vector3().subVectors(_pinchMid, rs.startPinch);
          const invMatrix = new THREE.Matrix4().copy(rs.panel.matrixWorld).invert();
          const localDelta = worldDelta.clone().transformDirection(invMatrix);

          let newW = rs.startWidth;
          let newH = rs.startHeight;
          if (rs.corner === 'br' || rs.corner === 'tr') newW += localDelta.x * 2;
          if (rs.corner === 'bl' || rs.corner === 'tl') newW -= localDelta.x * 2;
          if (rs.corner === 'tr' || rs.corner === 'tl') newH += localDelta.y * 2;
          if (rs.corner === 'br' || rs.corner === 'bl') newH -= localDelta.y * 2;
          newW = Math.max(0.15, Math.min(1.5, newW));
          newH = Math.max(0.1, Math.min(1.5, newH));
          // Store pending size; throttle actual resize to avoid per-frame rebuilds
          rs.pendingW = newW;
          rs.pendingH = newH;
          const now = performance.now();
          if (!rs.lastResize || now - rs.lastResize > 150) {
            rs.lastResize = now;
            if (rs.panel.resize) rs.panel.resize(newW, newH);
          }
        }
        _prevPinchPos[i].copy(_pinchMid);
      }

      // --- PINCH END ---
      if (!isPinching && wasPinching) {
        if (handDragStates[i]) {
          const handle = handDragStates[i].panel.dragHandle;
          if (handle?.userData.onHoverEnd) handle.userData.onHoverEnd();
          handDragStates[i] = null;
        }
        if (handResizeStates[i]) {
          // Apply final resize at the last computed size
          const rs = handResizeStates[i];
          if (rs.pendingW && rs.pendingH && rs.panel.resize) {
            rs.panel.resize(rs.pendingW, rs.pendingH);
          }
          handResizeStates[i] = null;
        }
      }

      hand.userData.pinching = isPinching;

      // --- FINGER POKE (index finger tip proximity to buttons) ---
      _pokeSphere.center.copy(_indexPos);
      for (const mesh of targets) {
        const btn = findParentButton(mesh);
        if (!btn) continue;
        // Get the world bounding box of the hit mesh
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        const bb = mesh.geometry.boundingBox.clone();
        mesh.updateWorldMatrix(true, false);
        bb.applyMatrix4(mesh.matrixWorld);
        // Expand slightly for easier poking
        bb.expandByScalar(0.005);

        const isInside = bb.containsPoint(_indexPos);
        const wasInside = pokedButtons[i].has(btn.uuid);

        if (isInside && !wasInside) {
          pokedButtons[i].add(btn.uuid);
          if (btn.userData.onSelectStart) btn.userData.onSelectStart();
          setTimeout(() => {
            if (btn.userData.onSelectEnd) btn.userData.onSelectEnd();
          }, 100);
        } else if (!isInside && wasInside) {
          pokedButtons[i].delete(btn.uuid);
        }
      }
    }
  }
}

// --- Mouse / touch input ---

function screenToNDC(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

function raycastMouse() {
  if (!storedCamera) return null;
  raycaster.setFromCamera(mouse, storedCamera);
  const targets = getInteractableList();
  const intersects = raycaster.intersectObjects(targets, false);
  return intersects.length > 0 ? intersects[0] : null;
}

// Mouse resize state
let mouseResizeState = null;

function onPointerMove(e, canvas) {
  screenToNDC(e, canvas);

  // Mouse drag in progress — use NDC delta for reliable movement
  if (dragState && dragState.source === 'mouse') {
    const dx = mouse.x - dragState.startMouseX;
    const dy = mouse.y - dragState.startMouseY;
    dragState.panel.position.x = dragState.startPanelX + dx * dragState.scaleX;
    dragState.panel.position.y = dragState.startPanelY + dy * dragState.scaleY;
    return;
  }

  // Mouse resize in progress
  if (mouseResizeState) {
    const rs = mouseResizeState;
    const dx = mouse.x - rs.startMouseX;
    const dy = mouse.y - rs.startMouseY;
    let newW = rs.startWidth;
    let newH = rs.startHeight;
    if (rs.corner === 'br' || rs.corner === 'tr') newW += dx * rs.scaleX * 2;
    if (rs.corner === 'bl' || rs.corner === 'tl') newW -= dx * rs.scaleX * 2;
    if (rs.corner === 'tr' || rs.corner === 'tl') newH += dy * rs.scaleY * 2;
    if (rs.corner === 'br' || rs.corner === 'bl') newH -= dy * rs.scaleY * 2;
    newW = Math.max(0.15, Math.min(1.5, newW));
    newH = Math.max(0.1, Math.min(1.5, newH));
    rs.pendingW = newW;
    rs.pendingH = newH;
    const now = performance.now();
    if (!rs.lastResize || now - rs.lastResize > 100) {
      rs.lastResize = now;
      if (rs.panel.resize) rs.panel.resize(newW, newH);
    }
    return;
  }

  const result = raycastMouse();
  const hit = result?.object ?? null;
  const prevHovered = hoveredMap.get('mouse');

  if (hit) {
    if (hit !== prevHovered) {
      // End hover on previous
      if (prevHovered) {
        const prevBtn = findParentButton(prevHovered);
        if (prevBtn?.userData.onHoverEnd) prevBtn.userData.onHoverEnd();
        const prevHandle = findDragHandle(prevHovered);
        if (prevHandle?.userData.onHoverEnd) prevHandle.userData.onHoverEnd();
        const prevResize = findResizeHandle(prevHovered);
        if (prevResize?.userData.onHoverEnd) prevResize.userData.onHoverEnd();
      }
      hoveredMap.set('mouse', hit);
      // Start hover on new
      const btn = findParentButton(hit);
      const handle = findDragHandle(hit);
      const resizeH = findResizeHandle(hit);
      if (resizeH?.userData.onHoverStart) resizeH.userData.onHoverStart();
      else if (handle?.userData.onHoverStart) handle.userData.onHoverStart();
      else if (btn?.userData.onHoverStart) btn.userData.onHoverStart();
      canvas.style.cursor = resizeH ? 'nwse-resize' : (handle ? 'grab' : (btn ? 'pointer' : ''));
    }
  } else if (prevHovered) {
    const prevBtn = findParentButton(prevHovered);
    if (prevBtn?.userData.onHoverEnd) prevBtn.userData.onHoverEnd();
    const prevHandle = findDragHandle(prevHovered);
    if (prevHandle?.userData.onHoverEnd) prevHandle.userData.onHoverEnd();
    const prevResize = findResizeHandle(prevHovered);
    if (prevResize?.userData.onHoverEnd) prevResize.userData.onHoverEnd();
    hoveredMap.delete('mouse');
    canvas.style.cursor = '';
  }
}

function onPointerDown(e, canvas) {
  screenToNDC(e, canvas);
  const result = raycastMouse();
  if (!result) return;
  const hit = result.object;

  // Check if it's a resize handle first
  const resizeH = findResizeHandle(hit);
  if (resizeH?.userData.panel) {
    const panel = resizeH.userData.panel;
    mouseResizeState = {
      panel,
      corner: resizeH.userData.corner,
      startMouseX: mouse.x,
      startMouseY: mouse.y,
      startWidth: panel.panelWidth,
      startHeight: panel.panelHeight,
      scaleX: Math.tan(THREE.MathUtils.degToRad(storedCamera.fov / 2)) * Math.abs(panel.position.z) * storedCamera.aspect,
      scaleY: Math.tan(THREE.MathUtils.degToRad(storedCamera.fov / 2)) * Math.abs(panel.position.z),
      pendingW: panel.panelWidth,
      pendingH: panel.panelHeight,
      lastResize: 0,
    };
    canvas.style.cursor = 'nwse-resize';
    return;
  }

  // Check if it's a drag handle
  const handle = findDragHandle(hit);
  if (handle?.userData.panel) {
    const panel = handle.userData.panel;
    dragState = {
      panel,
      source: 'mouse',
      startMouseX: mouse.x,
      startMouseY: mouse.y,
      startPanelX: panel.position.x,
      startPanelY: panel.position.y,
      scaleX: Math.tan(THREE.MathUtils.degToRad(storedCamera.fov / 2)) * Math.abs(panel.position.z) * storedCamera.aspect,
      scaleY: Math.tan(THREE.MathUtils.degToRad(storedCamera.fov / 2)) * Math.abs(panel.position.z),
    };
    canvas.style.cursor = 'grabbing';
    return;
  }

  const btn = findParentButton(hit);
  if (!btn) return;

  console.log('[input] Mouse clicked button:', btn.children?.[1]?.text || 'unknown');
  if (btn.userData.onSelectStart) btn.userData.onSelectStart();
  setTimeout(() => {
    if (btn.userData.onSelectEnd) btn.userData.onSelectEnd();
  }, 100);
}

function onPointerUp(canvas) {
  if (dragState && dragState.source === 'mouse') {
    const handle = dragState.panel.dragHandle;
    if (handle?.userData.onHoverEnd) handle.userData.onHoverEnd();
    dragState = null;
    canvas.style.cursor = '';
  }
  if (mouseResizeState) {
    const rs = mouseResizeState;
    if (rs.panel.resize) rs.panel.resize(rs.pendingW, rs.pendingH);
    mouseResizeState = null;
    canvas.style.cursor = '';
  }
}

function raycastMousePlane(plane) {
  if (!storedCamera) return null;
  raycaster.setFromCamera(mouse, storedCamera);
  const target = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, target);
  return target;
}

function onWheel(e, canvas) {
  // Raycast to see if mouse is over a scrollable area
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  if (!storedCamera) return;
  raycaster.setFromCamera(mouse, storedCamera);

  // Check all scrollable meshes
  const scrollTargets = [...scrollListeners.keys()];
  const intersects = raycaster.intersectObjects(scrollTargets, false);
  if (intersects.length === 0) return;

  e.preventDefault();
  const hit = intersects[0].object;
  const listener = scrollListeners.get(hit);
  if (!listener) return;

  if (e.deltaY > 0 && listener.onScrollDown) {
    listener.onScrollDown();
  } else if (e.deltaY < 0 && listener.onScrollUp) {
    listener.onScrollUp();
  }
}
