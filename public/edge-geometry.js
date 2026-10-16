// FACTORY-882: `marker-end` places the arrowhead AT a line's own end point, never past it — so
// drawing an edge all the way to the target node's CENTRE (the simulation's own x/y) buries the
// arrowhead under the node shape, which paints on top (app.js appends nodeLayer after edgeLayer).
// `edgeEndPoint` is the pure geometry behind the fix: pull the line's end point back along the
// source->target direction by the target's own radius, so the drawn line — and therefore the
// arrowhead `marker-end` anchors to its end — stops at the node's boundary instead of its centre.
// Pure/no DOM so it's testable headlessly, same split as focus-force.js/focus-dim.js.

/**
 * `source`/`target` are plain `{x, y}` points (d3-force node objects satisfy this). `radius` is
 * the target node's own approximate radius (`approxRadiusForNode` in app.js). When the two points
 * coincide or are closer together than `radius` (so pulling back would overshoot past `source`),
 * returns `source` itself rather than a point beyond it.
 */
export function edgeEndPoint(source, target, radius) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= radius) return { x: source.x, y: source.y };
  const t = (dist - radius) / dist;
  return { x: source.x + dx * t, y: source.y + dy * t };
}
