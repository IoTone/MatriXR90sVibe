import * as THREE from 'three';
import { Panel } from './panel.js';
import { createButton } from './button.js';
import { createText } from './text-helpers.js';
import { registerInteractable, unregisterInteractable } from '../xr/input.js';
import { sendMessage } from '../matrix/client.js';

const ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'DEL'],
  ['SPACE', 'SEND'],
];

export class KeyboardPanel extends Panel {
  #buffer = '';
  #display = null;

  constructor() {
    super({ title: 'Keyboard', width: 0.6, height: 0.3 });
    this.#buildDisplay();
    this.#buildKeys();
  }

  #buildDisplay() {
    this.#display = createText({
      text: '|',
      fontSize: 0.018,
      color: 0xffffff,
      anchorX: 'left',
      anchorY: 'top',
      maxWidth: this.panelWidth - 0.04,
      outlineWidth: 0.0008,
    });
    this.#display.position.set(0, 0.005, 0);
    this.content.add(this.#display);
  }

  #buildKeys() {
    const keyW = 0.048;
    const keyH = 0.035;
    const gap = 0.005;
    const startY = -0.035;

    ROWS.forEach((row, rowIdx) => {
      const totalWidth = row.reduce((sum, key) => {
        const w = this.#keyWidth(key, keyW);
        return sum + w + gap;
      }, -gap);

      let x = (this.panelWidth - 0.04 - totalWidth) / 2;

      row.forEach((key) => {
        const w = this.#keyWidth(key, keyW);
        const btn = createButton(key, w, keyH, () => this.#onKey(key));
        btn.position.set(x + w / 2, startY - rowIdx * (keyH + gap), 0);
        this.content.add(btn);
        registerInteractable(btn.userData.hitMesh);
        x += w + gap;
      });
    });
  }

  #keyWidth(key, base) {
    if (key === 'SPACE') return base * 4;
    if (key === 'SEND') return base * 2.5;
    if (key === 'DEL') return base * 1.5;
    return base;
  }

  #onKey(key) {
    if (key === 'DEL') {
      this.#buffer = this.#buffer.slice(0, -1);
    } else if (key === 'SPACE') {
      this.#buffer += ' ';
    } else if (key === 'SEND') {
      if (this.#buffer.trim()) {
        sendMessage(this.#buffer.trim());
        this.#buffer = '';
      }
    } else {
      this.#buffer += key.toLowerCase();
    }
    this.#updateDisplay();
  }

  #updateDisplay() {
    this.#display.text = this.#buffer + '|';
    this.#display.sync();
  }

  dispose() {
    for (const child of this.content.children) {
      if (child.userData?.hitMesh) unregisterInteractable(child.userData.hitMesh);
    }
  }
}
