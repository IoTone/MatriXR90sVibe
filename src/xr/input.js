import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();
const interactables = new Set();

let controllers = [];
let hands = [];
let hoveredMap = new Map(); // source -> currently hovered object

/**
 * Register a mesh (typically a button's hitMesh) as interactable.
 */
export function registerInteractable(mesh) {
  interactables.add(mesh);
}

export function unregisterInteractable(mesh) {
  interactables.delete(mesh);
}

/**
 * Initialize controller and hand tracking inputs.
 */
export function initInput(renderer, scene) {
  const handModelFactory = new XRHandModelFactory();

  for (let i = 0; i < 2; i++) {
    // Controller
    const controller = renderer.xr.getController(i);
    scene.add(controller);

    // Ray visualization
    const lineGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -3),
    ]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.6 });
    const ray = new THREE.Line(lineGeom, lineMat);
    ray.name = 'ray';
    controller.add(ray);

    controller.addEventListener('selectstart', () => onSelectStart(controller));
    controller.addEventListener('selectend', () => onSelectEnd(controller));
    controllers.push(controller);

    // Controller grip (visual model)
    const grip = renderer.xr.getControllerGrip(i);
    scene.add(grip);

    // Hand
    const hand = renderer.xr.getHand(i);
    const handModel = handModelFactory.createHandModel(hand, 'mesh');
    hand.add(handModel);
    scene.add(hand);
    hands.push(hand);
  }
}

function getInteractableList() {
  return [...interactables];
}

function findParentButton(obj) {
  let current = obj;
  while (current) {
    if (current.userData && current.userData.isButton) return current;
    current = current.parent;
  }
  return null;
}

function onSelectStart(source) {
  const hovered = hoveredMap.get(source);
  if (hovered) {
    const btn = findParentButton(hovered);
    if (btn && btn.userData.onSelectStart) btn.userData.onSelectStart();
  }
}

function onSelectEnd(source) {
  const hovered = hoveredMap.get(source);
  if (hovered) {
    const btn = findParentButton(hovered);
    if (btn && btn.userData.onSelectEnd) btn.userData.onSelectEnd();
  }
}

/**
 * Run raycasting for controllers. Call each frame in the render loop.
 */
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
        // Hover end on previous
        if (prevHovered) {
          const prevBtn = findParentButton(prevHovered);
          if (prevBtn && prevBtn.userData.onHoverEnd) prevBtn.userData.onHoverEnd();
        }
        // Hover start on new
        hoveredMap.set(controller, hit);
        const btn = findParentButton(hit);
        if (btn && btn.userData.onHoverStart) btn.userData.onHoverStart();
      }
    } else if (prevHovered) {
      const prevBtn = findParentButton(prevHovered);
      if (prevBtn && prevBtn.userData.onHoverEnd) prevBtn.userData.onHoverEnd();
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
      if (!inputSource || !inputSource.hand) continue;

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
      const isPinching = dist < 0.025; // 2.5cm threshold

      if (isPinching && !wasPinching) {
        // Pinch start — raycast from index finger tip
        raycaster.ray.origin.set(ip.x, ip.y, ip.z);
        // Direction: from thumb to index (rough forward)
        raycaster.ray.direction.set(0, 0, -1);

        const intersects = raycaster.intersectObjects(targets, false);
        if (intersects.length > 0) {
          const hit = intersects[0].object;
          const btn = findParentButton(hit);
          if (btn) {
            if (btn.userData.onSelectStart) btn.userData.onSelectStart();
            // Small delay to show select state before triggering end
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
