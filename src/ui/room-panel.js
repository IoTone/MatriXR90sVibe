// Copyright 2026 IoTone, Inc.
// This source code is licensed under the MIT License (see LICENSE.txt).

import { Panel } from './panel.js';
import { createButton } from './button.js';
import { registerInteractable, unregisterInteractable } from '../xr/input.js';
import { store } from '../state/store.js';
import { selectRoom } from '../matrix/client.js';

export class RoomPanel extends Panel {
  constructor() {
    super({ title: 'Rooms', width: 0.45, height: 0.55 });
    this.#bind();
  }

  #bind() {
    store.on('rooms', (rooms) => this.#render(rooms));
    const current = store.get('rooms');
    if (current && current.length) this.#render(current);
  }

  #render(rooms) {
    for (const child of this.content.children) {
      if (child.userData?.hitMesh) unregisterInteractable(child.userData.hitMesh);
    }
    this.clearContent();

    const btnWidth = this.panelWidth - 0.06;
    const btnHeight = 0.04;
    const gap = 0.005;

    rooms.forEach((room, i) => {
      const btn = createButton(room.name, btnWidth, btnHeight, () => {
        selectRoom(room.id);
      });
      btn.position.set(btnWidth / 2, -(i * (btnHeight + gap)), 0);
      this.content.add(btn);
      registerInteractable(btn.userData.hitMesh);
    });
  }
}
