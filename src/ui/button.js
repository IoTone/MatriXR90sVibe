// Copyright 2026 IoTone, Inc.
// This source code is licensed under the MIT License (see LICENSE.txt).

import * as THREE from 'three';
import { createText } from './text-helpers.js';

const DEFAULT_COLOR = 0xff00ff;
const HOVER_COLOR = 0x00ffff;
const ACTIVE_COLOR = 0x39ff14;

/**
 * 90s neon button — glowing border, translucent fill, bright text.
 */
export function createButton(label, width = 0.2, height = 0.04, onClick = null) {
  const group = new THREE.Group();
  group.userData.isButton = true;

  // Background fill
  const geom = new THREE.PlaneGeometry(width, height);
  const mat = new THREE.MeshBasicMaterial({
    color: DEFAULT_COLOR,
    transparent: true,
    opacity: 0.15,
  });
  const bg = new THREE.Mesh(geom, mat);
  group.add(bg);

  // Neon border around button
  const borderCorners = [
    new THREE.Vector3(-width / 2, -height / 2, 0),
    new THREE.Vector3(width / 2, -height / 2, 0),
    new THREE.Vector3(width / 2, height / 2, 0),
    new THREE.Vector3(-width / 2, height / 2, 0),
    new THREE.Vector3(-width / 2, -height / 2, 0),
  ];
  const borderGeom = new THREE.BufferGeometry().setFromPoints(borderCorners);
  const borderMat = new THREE.LineBasicMaterial({
    color: DEFAULT_COLOR,
    transparent: true,
    opacity: 0.7,
  });
  const border = new THREE.Line(borderGeom, borderMat);
  border.position.z = 0.0005;
  group.add(border);

  // Hit target is the background mesh
  group.userData.hitMesh = bg;
  group.userData.onClick = onClick;

  // Text label — bright white with neon outline
  const text = createText({
    text: label,
    fontSize: 0.018,
    color: 0xffffff,
    anchorX: 'center',
    anchorY: 'middle',
    maxWidth: width - 0.01,
    outlineWidth: 0.001,
    outlineColor: 0xff00ff,
  });
  text.position.z = 0.001;
  group.add(text);

  // Hover/select handlers
  group.userData.onHoverStart = () => {
    mat.color.setHex(HOVER_COLOR);
    mat.opacity = 0.3;
    borderMat.color.setHex(HOVER_COLOR);
    borderMat.opacity = 1.0;
  };

  group.userData.onHoverEnd = () => {
    mat.color.setHex(DEFAULT_COLOR);
    mat.opacity = 0.15;
    borderMat.color.setHex(DEFAULT_COLOR);
    borderMat.opacity = 0.7;
  };

  group.userData.onSelectStart = () => {
    mat.color.setHex(ACTIVE_COLOR);
    mat.opacity = 0.45;
    borderMat.color.setHex(ACTIVE_COLOR);
  };

  group.userData.onSelectEnd = () => {
    mat.color.setHex(HOVER_COLOR);
    mat.opacity = 0.3;
    borderMat.color.setHex(HOVER_COLOR);
    if (onClick) onClick();
  };

  return group;
}
