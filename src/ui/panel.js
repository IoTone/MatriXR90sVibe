// Copyright 2026 IoTone, Inc.
// This source code is licensed under the MIT License (see LICENSE.txt).

import * as THREE from 'three';
import { createTitle } from './text-helpers.js';
import { registerInteractable, unregisterInteractable } from '../xr/input.js';

// Neon color palette — each panel gets a unique accent
const NEON_ACCENTS = [0xff00ff, 0x00ffff, 0x39ff14, 0xff6ec7];
let accentIndex = 0;

const HANDLE_HEIGHT = 0.045;

/**
 * Base Panel — 90s neon aesthetic with glowing borders.
 * Title bar doubles as drag handle.
 */
export class Panel extends THREE.Group {
  constructor({ title = '', width = 0.5, height = 0.6 } = {}) {
    super();

    this.panelWidth = width;
    this.panelHeight = height;
    this.neonColor = NEON_ACCENTS[accentIndex++ % NEON_ACCENTS.length];

    const bodyH = height - HANDLE_HEIGHT;

    // --- Body background (below title bar) ---
    const bgGeom = new THREE.PlaneGeometry(width, bodyH);
    const bgMat = new THREE.MeshBasicMaterial({
      color: this.neonColor,
      transparent: true,
      opacity: 0.06,
      side: THREE.DoubleSide,
    });
    this.background = new THREE.Mesh(bgGeom, bgMat);
    this.background.position.set(0, -HANDLE_HEIGHT / 2, 0);
    this.add(this.background);

    // --- Title bar / drag handle (full width, at top) ---
    const handleGeom = new THREE.PlaneGeometry(width, HANDLE_HEIGHT);
    this._handleMat = new THREE.MeshBasicMaterial({
      color: this.neonColor,
      transparent: true,
      opacity: 0.35,
    });
    this.dragHandle = new THREE.Mesh(handleGeom, this._handleMat);
    this.dragHandle.position.set(0, height / 2 - HANDLE_HEIGHT / 2, 0.005);
    this.dragHandle.userData.isDragHandle = true;
    this.dragHandle.userData.panel = this;
    this.add(this.dragHandle);
    registerInteractable(this.dragHandle);

    // Handle top + bottom border lines
    const handleY = this.dragHandle.position.y;
    this._handleBorderMats = [];
    for (const yOff of [-HANDLE_HEIGHT / 2, HANDLE_HEIGHT / 2]) {
      const pts = [
        new THREE.Vector3(-width / 2, yOff, 0),
        new THREE.Vector3(width / 2, yOff, 0),
      ];
      const mat = new THREE.LineBasicMaterial({
        color: this.neonColor,
        transparent: true,
        opacity: 0.6,
      });
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
      line.position.set(0, handleY, 0.006);
      this.add(line);
      this._handleBorderMats.push(mat);
    }

    // Grip dots (flanking the title)
    this._handleDots = [];
    const dotGeo = new THREE.CircleGeometry(0.003, 6);
    const dotBaseMat = new THREE.MeshBasicMaterial({
      color: this.neonColor, transparent: true, opacity: 0.5,
    });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const dot = new THREE.Mesh(dotGeo.clone(), dotBaseMat.clone());
        dot.position.set(
          side * (width / 2 - 0.025 - i * 0.014),
          handleY,
          0.007
        );
        this.add(dot);
        this._handleDots.push(dot);
      }
    }

    // Hover handlers — strong visual activation
    this.dragHandle.userData.onHoverStart = () => {
      this._handleMat.opacity = 0.7;
      this._handleMat.color.setHex(0xffffff);
      this._handleBorderMats.forEach((m) => { m.opacity = 1.0; m.color.setHex(0xffffff); });
      this._handleDots.forEach((d) => { d.material.opacity = 1.0; d.material.color.setHex(0xffffff); });
      if (this.titleText) { this.titleText.color = 0xffffff; this.titleText.sync(); }
    };
    this.dragHandle.userData.onHoverEnd = () => {
      this._handleMat.opacity = 0.35;
      this._handleMat.color.setHex(this.neonColor);
      this._handleBorderMats.forEach((m) => { m.opacity = 0.6; m.color.setHex(this.neonColor); });
      this._handleDots.forEach((d) => { d.material.opacity = 0.5; d.material.color.setHex(this.neonColor); });
      if (this.titleText) { this.titleText.color = this.neonColor; this.titleText.sync(); }
    };

    // Title text — centered inside the drag handle, in front of it
    if (title) {
      this.titleText = createTitle(title, { color: this.neonColor, fontSize: 0.024 });
      this.titleText.position.set(0, this.dragHandle.position.y, 0.008);
      this.add(this.titleText);
    }

    // --- Neon border around entire panel ---
    this._buildNeonBorder(width, height);

    // Scanline overlay
    this._buildScanlines(width, height);

    // Content container — starts below title bar
    this.content = new THREE.Group();
    this.content.position.set(
      -width / 2 + 0.02,
      height / 2 - HANDLE_HEIGHT - 0.015,
      0.003
    );
    this.add(this.content);

    // --- Resize handles at corners ---
    this._resizeHandles = [];
    this._buildResizeHandles(width, height);
  }

  _buildResizeHandles(w, h) {
    const size = 0.025;
    const corners = [
      { key: 'tl', x: -w / 2, y: h / 2 },
      { key: 'tr', x: w / 2, y: h / 2 },
      { key: 'bl', x: -w / 2, y: -h / 2 },
      { key: 'br', x: w / 2, y: -h / 2 },
    ];
    for (const c of corners) {
      const geo = new THREE.PlaneGeometry(size, size);
      const mat = new THREE.MeshBasicMaterial({
        color: this.neonColor,
        transparent: true,
        opacity: 0.0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(c.x, c.y, 0.004);
      mesh.userData.isResizeHandle = true;
      mesh.userData.corner = c.key;
      mesh.userData.panel = this;
      mesh.userData.onHoverStart = () => { mat.opacity = 0.6; };
      mesh.userData.onHoverEnd = () => { mat.opacity = 0.0; };
      this.add(mesh);
      registerInteractable(mesh);
      this._resizeHandles.push(mesh);
    }
  }

  resize(newWidth, newHeight) {
    // Remove old resize handles
    for (const h of this._resizeHandles) {
      unregisterInteractable(h);
      this.remove(h);
      h.geometry.dispose();
      h.material.dispose();
    }
    this._resizeHandles = [];

    this.panelWidth = newWidth;
    this.panelHeight = newHeight;

    const bodyH = newHeight - HANDLE_HEIGHT;

    // Update background
    this.background.geometry.dispose();
    this.background.geometry = new THREE.PlaneGeometry(newWidth, bodyH);
    this.background.position.set(0, -HANDLE_HEIGHT / 2, 0);

    // Update drag handle
    this.dragHandle.geometry.dispose();
    this.dragHandle.geometry = new THREE.PlaneGeometry(newWidth, HANDLE_HEIGHT);
    this.dragHandle.position.set(0, newHeight / 2 - HANDLE_HEIGHT / 2, 0.005);

    // Update title position
    if (this.titleText) {
      this.titleText.position.set(0, this.dragHandle.position.y, 0.008);
    }

    // Update content container position
    this.content.position.set(
      -newWidth / 2 + 0.02,
      newHeight / 2 - HANDLE_HEIGHT - 0.015,
      0.003
    );

    // Rebuild resize handles
    this._buildResizeHandles(newWidth, newHeight);
  }

  _buildNeonBorder(w, h) {
    const corners = [
      new THREE.Vector3(-w / 2, -h / 2, 0),
      new THREE.Vector3(w / 2, -h / 2, 0),
      new THREE.Vector3(w / 2, h / 2, 0),
      new THREE.Vector3(-w / 2, h / 2, 0),
      new THREE.Vector3(-w / 2, -h / 2, 0),
    ];

    const outerGeom = new THREE.BufferGeometry().setFromPoints(corners);

    // Outer glow
    this.add(new THREE.Line(outerGeom, new THREE.LineBasicMaterial({
      color: this.neonColor, transparent: true, opacity: 0.3,
    })));

    // Mid glow
    const mid = new THREE.Line(outerGeom.clone(), new THREE.LineBasicMaterial({
      color: this.neonColor, transparent: true, opacity: 0.6,
    }));
    mid.position.z = 0.001;
    this.add(mid);

    // Inner bright core
    const inner = new THREE.Line(outerGeom.clone(), new THREE.LineBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.9,
    }));
    inner.position.z = 0.002;
    this.add(inner);

    // Corner accents
    const cSize = 0.015;
    const cGeo = new THREE.PlaneGeometry(cSize, cSize);
    const cMat = new THREE.MeshBasicMaterial({
      color: this.neonColor, transparent: true, opacity: 0.8,
    });
    for (const [cx, cy] of [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]]) {
      const dot = new THREE.Mesh(cGeo.clone(), cMat.clone());
      dot.position.set(cx, cy, 0.003);
      this.add(dot);
    }
  }

  _buildScanlines(w, h) {
    const count = Math.floor(h / 0.008);
    const positions = [];
    for (let i = 0; i < count; i++) {
      const y = -h / 2 + i * 0.008;
      positions.push(-w / 2, y, 0.001, w / 2, y, 0.001);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color: this.neonColor, transparent: true, opacity: 0.04,
    })));
  }

  setTitle(text) {
    if (this.titleText) {
      this.titleText.text = text;
      this.titleText.sync();
    }
  }

  clearContent() {
    while (this.content.children.length > 0) {
      const child = this.content.children[0];
      this.content.remove(child);
      if (child.dispose) child.dispose();
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    }
  }
}
