// WCAG 2.x contrast-ratio calculator (relative luminance + the standard contrast formula), used
// to check the shape-stroke tokens below against >= 4.5:1 in both themes (FACTORY-876 item 3).
// Pure and DOM-free so it is directly testable; also usable from app.js if a run-time check is
// ever wanted.

function srgbChannelToLinear(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function hexToRgb(hex) {
  const normalized = hex.replace(/^#/, "");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return [r, g, b];
}

/** WCAG relative luminance of a `#rrggbb` hex colour. */
export function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b);
}

/** WCAG contrast ratio between two `#rrggbb` hex colours, always >= 1. */
export function contrastRatio(hexA, hexB) {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** The WCAG AA "normal text" / graphical-object threshold this ticket pins shape strokes to. */
export const MIN_CONTRAST = 4.5;

/**
 * seer's dark- and light-theme canvas backgrounds and shape-stroke colours (mirrored from
 * `public/style.css`'s `--bg` / `--shape-stroke` custom properties — FACTORY-873 owns the
 * canonical theme-token names; these are defined identically here per FACTORY-876's "if 873
 * hasn't merged, define identically and note a trivial conflict" instruction. See the PR
 * description for the expected conflict).
 */
export const THEME_TOKENS = Object.freeze({
  dark: { bg: "#1e1e2e", shapeStroke: "#cdd6f4" },
  light: { bg: "#eff1f5", shapeStroke: "#4c4f69" },
});
