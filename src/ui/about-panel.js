// Copyright 2026 IoTone, Inc.
// This source code is licensed under the MIT License (see LICENSE.txt).

import { Panel } from './panel.js';
import { createText } from './text-helpers.js';

export class AboutPanel extends Panel {
  #clockText = null;
  #timerId = null;

  constructor(version) {
    super({ title: 'About', width: 0.35, height: 0.25 });
    this.#render(version);
    this.#startClock();
  }

  #render(version) {
    let y = 0;

    // Application title
    const title = createText({
      text: 'MatriXR90S',
      fontSize: 0.024,
      color: 0xff006e,
      anchorX: 'left',
      anchorY: 'top',
      outlineWidth: 0.001,
      outlineColor: 0x330015,
    });
    title.position.set(0, y, 0);
    this.content.add(title);
    y -= 0.035;

    // Version
    const ver = createText({
      text: `v${version}`,
      fontSize: 0.016,
      color: 0x00ffff,
      anchorX: 'left',
      anchorY: 'top',
      outlineWidth: 0.0006,
      outlineColor: 0x003333,
    });
    ver.position.set(0, y, 0);
    this.content.add(ver);
    y -= 0.03;

    // Copyright
    const copyright = createText({
      text: 'Copyright (c) 2026 IoTone, Inc.\nMIT License',
      fontSize: 0.013,
      color: 0x888899,
      anchorX: 'left',
      anchorY: 'top',
      outlineWidth: 0.0004,
      maxWidth: this.panelWidth - 0.04,
    });
    copyright.position.set(0, y, 0);
    this.content.add(copyright);
    y -= 0.045;

    // Clock label
    const clockLabel = createText({
      text: 'Local Time:',
      fontSize: 0.012,
      color: 0x666677,
      anchorX: 'left',
      anchorY: 'top',
      outlineWidth: 0.0004,
    });
    clockLabel.position.set(0, y, 0);
    this.content.add(clockLabel);
    y -= 0.022;

    // Digital clock
    this.#clockText = createText({
      text: this.#formatTime(),
      fontSize: 0.022,
      color: 0x39ff14,
      anchorX: 'left',
      anchorY: 'top',
      outlineWidth: 0.001,
      outlineColor: 0x0a3300,
    });
    this.#clockText.position.set(0, y, 0);
    this.content.add(this.#clockText);
  }

  #formatTime() {
    const now = new Date();
    return now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  }

  #startClock() {
    this.#timerId = setInterval(() => {
      if (this.#clockText) {
        this.#clockText.text = this.#formatTime();
        this.#clockText.sync();
      }
    }, 1000);
  }

  dispose() {
    if (this.#timerId) clearInterval(this.#timerId);
    super.dispose?.();
  }
}
