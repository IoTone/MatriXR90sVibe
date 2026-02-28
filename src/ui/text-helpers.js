import { Text } from 'troika-three-text';

const DEFAULTS = {
  fontSize: 0.022,
  color: 0xffffff,
  anchorX: 'left',
  anchorY: 'top',
  outlineWidth: 0.001,
  outlineColor: 0x222222,
  maxWidth: 0.4,
};

/**
 * Create a troika Text mesh with AR-readable defaults.
 * @param {object} opts - Override any troika Text property
 * @returns {Text}
 */
export function createText(opts = {}) {
  const text = new Text();
  const merged = { ...DEFAULTS, ...opts };
  Object.assign(text, merged);
  text.sync();
  return text;
}

/**
 * Create a title-style text for panel headers.
 */
export function createTitle(label, opts = {}) {
  return createText({
    text: label,
    fontSize: 0.028,
    color: 0x00ffff,
    outlineWidth: 0.0015,
    outlineColor: 0x003333,
    anchorX: 'center',
    anchorY: 'middle',
    ...opts,
  });
}
