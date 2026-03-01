// Copyright 2026 IoTone, Inc.
// This source code is licensed under the MIT License (see LICENSE.txt).

import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { store } from '../state/store.js';

export let renderer, scene, camera;

export function initThree() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
  // Default position for desktop viewing (looking at panels at z=-1.5)
  camera.position.set(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // Ambient light so panels are visible
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

export function createARButton() {
  const domOverlay = document.getElementById('dom-overlay');

  const features = ['local-floor', 'hand-tracking'];
  const optionalFeatures = [];

  // DOM overlay support
  if (domOverlay) {
    optionalFeatures.push('dom-overlay');
  }

  const button = ARButton.createButton(renderer, {
    requiredFeatures: ['local-floor'],
    optionalFeatures: ['hand-tracking', 'dom-overlay'],
    domOverlay: domOverlay ? { root: domOverlay } : undefined,
  });

  const container = document.getElementById('ar-button-container');
  container.appendChild(button);

  renderer.xr.addEventListener('sessionstart', () => {
    store.set('xrActive', true);
    if (domOverlay) domOverlay.classList.add('active');
  });

  renderer.xr.addEventListener('sessionend', () => {
    store.set('xrActive', false);
    if (domOverlay) domOverlay.classList.remove('active');
  });

  return button;
}

export function startRenderLoop(callback) {
  renderer.setAnimationLoop((time, frame) => {
    if (callback) callback(time, frame);
    renderer.render(scene, camera);
  });
}

/**
 * Detect additive blend mode (Snap Spectacles, HoloLens, etc.)
 * Returns true if the display blends additively (black = transparent).
 */
export function isAdditiveDisplay() {
  const session = renderer.xr.getSession();
  if (!session) return false;
  try {
    return session.environmentBlendMode === 'additive';
  } catch {
    return false;
  }
}
