// FACTORY-982 item 3: visual priority for the focus group (selected node + neighbours) — every
// other node/edge gets a `.dimmed` CSS class (never inline style, so the existing light/dark theme
// tokens keep driving the actual colour). These two predicates are pure so `app.js`'s `.classed(
// "dimmed", ...)` calls (the only place that touches the DOM) can be driven by logic that's
// testable without a browser.

/** Whether node `nodeId` should be dimmed: true for every node EXCEPT the focus group, false for all of them when nothing is selected (`focusIds` empty — no dimming with no selection). */
export function isNonFocus(nodeId, focusIds) {
  return focusIds.size > 0 && !focusIds.has(nodeId);
}

/**
 * Whether an edge should be dimmed: an edge between two focus-group nodes (selected<->neighbour,
 * or neighbour<->neighbour) stays fully visible; every other edge — touching at least one non-focus
 * node — dims, same as a non-focus node itself. `edge` is the same `{source, target}` shape
 * `app.js`'s `links` array uses, normalized the same way `neighboursOf`/`epicCountForProject`
 * already do since d3's `forceLink` resolves `source`/`target` from a string id to a node object
 * reference in place after the first tick.
 */
export function isEdgeDimmed(edge, focusIds) {
  if (focusIds.size === 0) return false;
  const sourceId = typeof edge.source === "object" ? edge.source.id : edge.source;
  const targetId = typeof edge.target === "object" ? edge.target.id : edge.target;
  return !(focusIds.has(sourceId) && focusIds.has(targetId));
}
