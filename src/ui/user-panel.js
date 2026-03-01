// Copyright 2026 IoTone, Inc.
// This source code is licensed under the MIT License (see LICENSE.txt).

import { Panel } from './panel.js';
import { createText } from './text-helpers.js';
import { createButton } from './button.js';
import { registerInteractable } from '../xr/input.js';
import { getUserId, logout } from '../matrix/client.js';

export class UserPanel extends Panel {
  #onLogout = null;

  constructor(onLogout) {
    super({ title: 'User', width: 0.35, height: 0.2 });
    this.#onLogout = onLogout;
    this.#render();
  }

  #render() {
    this.clearContent();

    const userId = getUserId();
    const shortName = userId.split(':')[0].replace('@', '');

    // User icon label
    const userLabel = createText({
      text: `Logged in as:`,
      fontSize: 0.015,
      color: 0x888899,
      anchorX: 'left',
      anchorY: 'top',
      outlineWidth: 0.0006,
      outlineColor: 0x222233,
    });
    userLabel.position.set(0, 0, 0);
    this.content.add(userLabel);

    // Username
    const userName = createText({
      text: shortName,
      fontSize: 0.022,
      color: 0x00ffff,
      anchorX: 'left',
      anchorY: 'top',
      outlineWidth: 0.001,
      outlineColor: 0x003333,
      maxWidth: this.panelWidth - 0.04,
    });
    userName.position.set(0, -0.025, 0);
    this.content.add(userName);

    // Full userId (smaller)
    const fullId = createText({
      text: userId,
      fontSize: 0.012,
      color: 0x666677,
      anchorX: 'left',
      anchorY: 'top',
      outlineWidth: 0.0004,
      maxWidth: this.panelWidth - 0.04,
    });
    fullId.position.set(0, -0.055, 0);
    this.content.add(fullId);

    // Logout button
    const logoutBtn = createButton('LOGOUT', this.panelWidth - 0.06, 0.04, () => {
      console.log('[user] Logout clicked');
      logout().then(() => {
        if (this.#onLogout) this.#onLogout();
      });
    });
    logoutBtn.position.set((this.panelWidth - 0.06) / 2, -0.09, 0);
    this.content.add(logoutBtn);
    registerInteractable(logoutBtn.userData.hitMesh);
  }
}
