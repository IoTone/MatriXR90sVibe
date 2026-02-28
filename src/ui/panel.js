import * as THREE from 'three';
import { createTitle } from './text-helpers.js';

/**
 * Base Panel — a floating 3D container with a bright semi-transparent background,
 * a title bar, and a content area. Designed for additive AR displays.
 */
export class Panel extends THREE.Group {
  constructor({ title = '', width = 0.5, height = 0.6 } = {}) {
    super();

    this.panelWidth = width;
    this.panelHeight = height;

    // Background plane — bright semi-transparent for additive displays
    const bgGeom = new THREE.PlaneGeometry(width, height);
    const bgMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
    });
    this.background = new THREE.Mesh(bgGeom, bgMat);
    this.add(this.background);

    // Thin border frame
    const borderGeom = new THREE.EdgesGeometry(bgGeom);
    const borderMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.5 });
    this.border = new THREE.LineSegments(borderGeom, borderMat);
    this.add(this.border);

    // Title
    if (title) {
      this.titleText = createTitle(title);
      this.titleText.position.set(0, height / 2 - 0.03, 0.001);
      this.add(this.titleText);
    }

    // Content container — position starts below title
    this.content = new THREE.Group();
    this.content.position.set(-width / 2 + 0.02, height / 2 - 0.07, 0.001);
    this.add(this.content);
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
