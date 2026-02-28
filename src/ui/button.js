import * as THREE from 'three';
import { createText } from './text-helpers.js';

const DEFAULT_COLOR = 0x2288aa;
const HOVER_COLOR = 0x44ccff;
const ACTIVE_COLOR = 0x00ffcc;

/**
 * Create a 3D interactive button with a background plane and text label.
 * Registers itself as interactable for XR raycasting.
 *
 * @param {string} label
 * @param {number} width
 * @param {number} height
 * @param {Function} onClick
 * @returns {THREE.Group}
 */
export function createButton(label, width = 0.2, height = 0.04, onClick = null) {
  const group = new THREE.Group();
  group.userData.isButton = true;

  // Background plane
  const geom = new THREE.PlaneGeometry(width, height);
  const mat = new THREE.MeshBasicMaterial({
    color: DEFAULT_COLOR,
    transparent: true,
    opacity: 0.35,
  });
  const bg = new THREE.Mesh(geom, mat);
  group.add(bg);

  // Hit target is the background mesh
  group.userData.hitMesh = bg;
  group.userData.onClick = onClick;

  // Text label
  const text = createText({
    text: label,
    fontSize: 0.018,
    color: 0xffffff,
    anchorX: 'center',
    anchorY: 'middle',
    maxWidth: width - 0.01,
    outlineWidth: 0.0008,
  });
  text.position.z = 0.001;
  group.add(text);

  // Hover/select handlers called by the input system
  group.userData.onHoverStart = () => {
    mat.color.setHex(HOVER_COLOR);
    mat.opacity = 0.5;
  };

  group.userData.onHoverEnd = () => {
    mat.color.setHex(DEFAULT_COLOR);
    mat.opacity = 0.35;
  };

  group.userData.onSelectStart = () => {
    mat.color.setHex(ACTIVE_COLOR);
    mat.opacity = 0.6;
  };

  group.userData.onSelectEnd = () => {
    mat.color.setHex(HOVER_COLOR);
    mat.opacity = 0.5;
    if (onClick) onClick();
  };

  return group;
}
