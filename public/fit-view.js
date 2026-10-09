// Fit-to-view transform math for FACTORY-890's COMPACT LAYOUT acceptance item 1. A pure,
// DOM/D3-free module (same contract as shapes.js/node-scale.js) so it is testable headless and
// reusable by the real-data CI layout check (test/layout.test.ts) without spinning up a browser.

/** Label font-size is fixed at 10px (style.css `.node-label`) independent of node size — this is
 * the floor `computeFitTransform` refuses to zoom out past, so a fit-to-view never makes labels
 * unreadable (FACTORY-890/FACTORY-889: "node labels >= 10 px" after fit). */
export const LABEL_FONT_PX = 10;
export const MIN_READABLE_SCALE = 1;
export const DEFAULT_MAX_SCALE = 3;
export const DEFAULT_PADDING = 40;

/**
 * Computes a `{x, y, k}` zoom transform that fits every `{x, y, r}` point (a node centre plus its
 * drawn radius, so shapes are never clipped) inside a `viewportWidth x viewportHeight` viewport,
 * centred, with `padding` px of margin. `k` is clamped to `[MIN_READABLE_SCALE, maxScale]`: it
 * never zooms out far enough to shrink the fixed 10px label font below `LABEL_FONT_PX` on screen,
 * even if that leaves the bounding box slightly overflowing the viewport — that overflow is what
 * the compact-layout tuning (tighter link distance, weaker repulsion, centering gravity) exists to
 * avoid in the first place.
 */
export function computeFitTransform(points, viewportWidth, viewportHeight, options = {}) {
  const padding = options.padding ?? DEFAULT_PADDING;
  const maxScale = options.maxScale ?? DEFAULT_MAX_SCALE;

  if (!points || points.length === 0) {
    return { x: viewportWidth / 2, y: viewportHeight / 2, k: 1 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    const r = p.r ?? 0;
    minX = Math.min(minX, p.x - r);
    maxX = Math.max(maxX, p.x + r);
    minY = Math.min(minY, p.y - r);
    maxY = Math.max(maxY, p.y + r);
  }

  const bboxWidth = Math.max(maxX - minX, 1);
  const bboxHeight = Math.max(maxY - minY, 1);
  const availableWidth = Math.max(viewportWidth - 2 * padding, 1);
  const availableHeight = Math.max(viewportHeight - 2 * padding, 1);

  const idealScale = Math.min(availableWidth / bboxWidth, availableHeight / bboxHeight);
  const k = Math.min(Math.max(idealScale, MIN_READABLE_SCALE), maxScale);

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return {
    x: viewportWidth / 2 - k * centerX,
    y: viewportHeight / 2 - k * centerY,
    k,
  };
}

/**
 * Whether a call to `fit()` should actually move the viewport (FACTORY-897). `force` is the
 * explicit Fit-button override; otherwise a prior user pan/zoom (`userTransformed`) wins — this
 * is the same guard `app.js`'s `fit()` applies, pulled out so the trigger (load, status-only
 * refresh, or user gesture) can be tested without a DOM/d3 simulation.
 */
export function shouldFit({ userTransformed, force = false }) {
  return force || !userTransformed;
}
