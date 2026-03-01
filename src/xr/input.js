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

// Drag state
let dragState = null; // { panel, offsetWorld, source }

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

  // Hand pinch detection
  if (frame) {
    const session = renderer.xr.getSession();
    const refSpace = renderer.xr.getReferenceSpace();
    if (!session || !refSpace) return;

    for (let i = 0; i < hands.length; i++) {
      const hand = hands[i];
      const inputSource = session.inputSources[i];
      if (!inputSource?.hand) continue;

      const indexTip = inputSource.hand.get('index-finger-tip');
      const thumbTip = inputSource.hand.get('thumb-tip');
      if (!indexTip || !thumbTip) continue;

      const indexPose = frame.getJointPose(indexTip, refSpace);
      const thumbPose = frame.getJointPose(thumbTip, refSpace);
      if (!indexPose || !thumbPose) continue;

      const ip = indexPose.transform.position;
      const tp = thumbPose.transform.position;
      const dist = Math.sqrt(
        (ip.x - tp.x) ** 2 + (ip.y - tp.y) ** 2 + (ip.z - tp.z) ** 2
      );

      const wasPinching = hand.userData.pinching || false;
      const isPinching = dist < 0.025;

      if (isPinching && !wasPinching) {
        raycaster.ray.origin.set(ip.x, ip.y, ip.z);
        raycaster.ray.direction.set(0, 0, -1);
        const intersects = raycaster.intersectObjects(targets, false);
        if (intersects.length > 0) {
          const hit = intersects[0].object;
          const btn = findParentButton(hit);
          if (btn) {
            if (btn.userData.onSelectStart) btn.userData.onSelectStart();
            setTimeout(() => {
              if (btn.userData.onSelectEnd) btn.userData.onSelectEnd();
            }, 100);
          }
        }
      }

      hand.userData.pinching = isPinching;
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
      }
      hoveredMap.set('mouse', hit);
      // Start hover on new
      const btn = findParentButton(hit);
      const handle = findDragHandle(hit);
      if (handle?.userData.onHoverStart) handle.userData.onHoverStart();
      else if (btn?.userData.onHoverStart) btn.userData.onHoverStart();
      canvas.style.cursor = handle ? 'grab' : (btn ? 'pointer' : '');
    }
  } else if (prevHovered) {
    const prevBtn = findParentButton(prevHovered);
    if (prevBtn?.userData.onHoverEnd) prevBtn.userData.onHoverEnd();
    const prevHandle = findDragHandle(prevHovered);
    if (prevHandle?.userData.onHoverEnd) prevHandle.userData.onHoverEnd();
    hoveredMap.delete('mouse');
    canvas.style.cursor = '';
  }
}

function onPointerDown(e, canvas) {
  screenToNDC(e, canvas);
  const result = raycastMouse();
  if (!result) return;
  const hit = result.object;

  // Check if it's a drag handle
  const handle = findDragHandle(hit);
  if (handle?.userData.panel) {
    const panel = handle.userData.panel;

    // Use the actual raycast hit point as the starting reference.
    // Record the initial mouse NDC and panel position — we'll drag
    // by projecting mouse delta into world-space movement.
    dragState = {
      panel,
      source: 'mouse',
      startMouseX: mouse.x,
      startMouseY: mouse.y,
      startPanelX: panel.position.x,
      startPanelY: panel.position.y,
      // Scale factor: how much world-space movement per NDC unit.
      // At z=-1.5 with fov=70, the visible height is ~2*1.5*tan(35deg)≈2.1
      // NDC range is -1..1 (height 2), so scale ≈ 1.05
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
    // Re-trigger hover end on the handle so it dims back
    const handle = dragState.panel.dragHandle;
    if (handle?.userData.onHoverEnd) handle.userData.onHoverEnd();
    dragState = null;
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
