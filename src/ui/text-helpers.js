// Copyright 2026 IoTone, Inc.
// This source code is licensed under the MIT License (see LICENSE.txt).

import { Text } from 'troika-three-text';

const DEFAULTS = {
  fontSize: 0.022,
  color: 0xeeeeff,
  anchorX: 'left',
  anchorY: 'top',
  outlineWidth: 0.001,
  outlineColor: 0xff00ff,
  maxWidth: 0.4,
};

/**
 * Create a troika Text mesh with neon-style defaults for AR readability.
 */
export function createText(opts = {}) {
  const text = new Text();
  const merged = { ...DEFAULTS, ...opts };
  Object.assign(text, merged);
  text.sync();
  return text;
}

/**
 * Create a title-style text — bright neon glow.
 */
export function createTitle(label, opts = {}) {
  return createText({
    text: label,
    fontSize: 0.028,
    color: opts.color || 0x00ffff,
    outlineWidth: 0.002,
    outlineColor: 0x003333,
    anchorX: 'center',
    anchorY: 'middle',
    ...opts,
  });
}
