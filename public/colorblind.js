// Colour-blindness simulation (FACTORY-900 item 2): the simplified HCIRN dichromacy matrices,
// applied directly to sRGB 0-255 channels. This is the same approximation widely used by
// browser-based colour-blind simulators (it skips the full LMS round-trip a Brettel/Vienot/
// Machado simulation would do), chosen deliberately here because it only needs to answer one
// question well — "do these five fills still separate under each dichromacy type" — not render
// a visually faithful image.

const MATRICES = Object.freeze({
  protanopia: [
    [0.567, 0.433, 0.0],
    [0.558, 0.442, 0.0],
    [0.0, 0.242, 0.758],
  ],
  deuteranopia: [
    [0.625, 0.375, 0.0],
    [0.7, 0.3, 0.0],
    [0.0, 0.3, 0.7],
  ],
  tritanopia: [
    [0.95, 0.05, 0.0],
    [0.0, 0.433, 0.567],
    [0.0, 0.475, 0.525],
  ],
});

export const COLORBLIND_TYPES = Object.freeze(Object.keys(MATRICES));

function hexToRgb(hex) {
  const normalized = hex.replace(/^#/, "");
  return [parseInt(normalized.slice(0, 2), 16), parseInt(normalized.slice(2, 4), 16), parseInt(normalized.slice(4, 6), 16)];
}

/** Simulates a `#rrggbb` hex colour as seen under the given dichromacy type; returns `[r, g, b]` (0-255, unclamped). */
export function simulateColorblind(hex, type) {
  const matrix = MATRICES[type];
  if (!matrix) throw new Error(`unknown colour-blindness type: ${type}`);
  const [r, g, b] = hexToRgb(hex);
  return matrix.map(([mr, mg, mb]) => mr * r + mg * g + mb * b);
}

/** Euclidean distance between two `[r, g, b]` triples, in the same 0-255-per-channel space `simulateColorblind` returns. */
export function rgbDistance(a, b) {
  return Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));
}
