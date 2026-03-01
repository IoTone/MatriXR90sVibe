// Copyright 2026 IoTone, Inc.
// This source code is licensed under the MIT License (see LICENSE.txt).

import * as THREE from 'three';
import { Panel } from './panel.js';
import { createText } from './text-helpers.js';
import { createButton } from './button.js';
import { registerInteractable, unregisterInteractable, registerScrollable } from '../xr/input.js';
import { store } from '../state/store.js';
import { loadOlderMessages, hasOlderMessages } from '../matrix/client.js';

const VISIBLE_LINES = 13;
const LINE_HEIGHT = 0.032;

export class ChatPanel extends Panel {
  #scrollOffset = 0; // 0 = bottom (newest), positive = scrolled up
  #messages = [];
  #loading = false;
  #upBtn = null;
  #downBtn = null;

  constructor() {
    super({ title: 'Chat', width: 0.55, height: 0.55 });
    this.#buildScrollButtons();
    this.#bind();

    // Register background for mouse wheel scrolling
    registerScrollable(this.background, {
      onScrollUp: () => this.#scrollUp(),
      onScrollDown: () => this.#scrollDown(),
    });
  }

  #bind() {
    store.on('messages', (messages) => {
      const wasAtBottom = this.#scrollOffset === 0;
      const oldLen = this.#messages.length;
      this.#messages = messages;

      if (messages.length > oldLen && oldLen > 0 && !wasAtBottom) {
        // Older messages prepended — adjust offset so view stays in place
        this.#scrollOffset += (messages.length - oldLen);
      } else if (wasAtBottom) {
        this.#scrollOffset = 0;
      }

      this.#render();
    });

    store.on('selectedRoomId', (roomId) => {
      this.#scrollOffset = 0;
      this.#messages = [];
      const rooms = store.get('rooms') || [];
      const room = rooms.find((r) => r.id === roomId);
      this.setTitle(room ? `Chat — ${room.name}` : 'Chat');
    });
  }

  #buildScrollButtons() {
    const btnW = 0.08;
    const btnH = 0.03;
    const rightEdge = this.panelWidth / 2 - 0.01;

    // Scroll up button (top-right of panel)
    this.#upBtn = createButton('\u25B2 UP', btnW, btnH, () => this.#scrollUp());
    this.#upBtn.position.set(
      rightEdge - btnW / 2 - 0.02,
      this.panelHeight / 2 - 0.07,
      0.004
    );
    this.add(this.#upBtn);
    registerInteractable(this.#upBtn.userData.hitMesh);

    // Scroll down button (bottom-right of panel)
    this.#downBtn = createButton('\u25BC DN', btnW, btnH, () => this.#scrollDown());
    this.#downBtn.position.set(
      rightEdge - btnW / 2 - 0.02,
      -this.panelHeight / 2 + 0.04,
      0.004
    );
    this.add(this.#downBtn);
    registerInteractable(this.#downBtn.userData.hitMesh);
  }

  async #scrollUp() {
    if (this.#loading) return;

    const maxOffset = Math.max(0, this.#messages.length - VISIBLE_LINES);
    this.#scrollOffset = Math.min(this.#scrollOffset + 5, maxOffset);

    // If scrolled near the top, load older messages
    const viewStart = this.#messages.length - this.#scrollOffset - VISIBLE_LINES;
    if (viewStart <= 3 && hasOlderMessages()) {
      this.#loading = true;
      console.log('[chat] Loading older messages…');
      await loadOlderMessages();
      this.#loading = false;
      // Messages updated via store listener, which calls #render
      return;
    }

    this.#render();
  }

  #scrollDown() {
    this.#scrollOffset = Math.max(0, this.#scrollOffset - 5);
    this.#render();
  }

  #render() {
    this.clearContent();

    const total = this.#messages.length;
    if (total === 0) return;

    // Calculate visible window
    const endIdx = total - this.#scrollOffset;
    const startIdx = Math.max(0, endIdx - VISIBLE_LINES);
    const visible = this.#messages.slice(startIdx, endIdx);

    // Position indicator
    const indicator = createText({
      text: this.#scrollOffset > 0
        ? `[${startIdx + 1}-${endIdx} of ${total}]`
        : `[${total} messages]`,
      fontSize: 0.012,
      color: 0x888888,
      anchorX: 'right',
      anchorY: 'top',
      maxWidth: 0.2,
      outlineWidth: 0.0004,
      outlineColor: 0x333333,
    });
    indicator.position.set(this.panelWidth - 0.14, 0.005, 0);
    this.content.add(indicator);

    visible.forEach((msg, i) => {
      const shortSender = msg.sender.split(':')[0].replace('@', '');
      const senderText = createText({
        text: shortSender,
        fontSize: 0.016,
        color: 0x00ffcc,
        anchorX: 'left',
        anchorY: 'top',
        maxWidth: 0.12,
        outlineWidth: 0.0008,
      });
      senderText.position.set(0, -(i * LINE_HEIGHT) - 0.02, 0);
      this.content.add(senderText);

      const bodyText = createText({
        text: msg.body,
        fontSize: 0.016,
        color: 0xffffff,
        anchorX: 'left',
        anchorY: 'top',
        maxWidth: this.panelWidth - 0.22,
        outlineWidth: 0.0006,
      });
      bodyText.position.set(0.13, -(i * LINE_HEIGHT) - 0.02, 0);
      this.content.add(bodyText);
    });

    // Loading indicator at top when fetching
    if (this.#loading) {
      const loadingText = createText({
        text: 'Loading…',
        fontSize: 0.014,
        color: 0xff00ff,
        anchorX: 'center',
        anchorY: 'top',
        outlineWidth: 0.001,
      });
      loadingText.position.set(this.panelWidth / 2 - 0.02, 0.005, 0);
      this.content.add(loadingText);
    }
  }
}
