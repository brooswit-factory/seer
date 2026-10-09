// FACTORY-982 item 2: a selection pins the focus group's `fx`/`fy` for the selection's duration,
// but deselect must release ONLY the pins the selection itself set — never a pin the user set by
// dragging a node (app.js's `dragBehavior`). This means "why is this node pinned" has two distinct
// origins that must be tracked separately, not one boolean. A pure, value-semantics module (same
// convention as selection.js): every function takes a tracker and returns a NEW one, never mutates
// its argument — `public/app.js` is the only caller, holding one tracker value and reassigning it.

/** `{ selectionPinned: Set<id>, userPinned: Set<id> }` — the entire state shape. Both start empty: nothing is pinned yet. */
export function createPinTracker() {
  return { selectionPinned: new Set(), userPinned: new Set() };
}

/**
 * A new selection pins `ids` (the selected node + its neighbours) — UNLESS a given id is already
 * user-pinned, which always wins (a user's own drag-pin is never downgraded to, or overwritten by,
 * a selection pin). Does NOT clear any previous selection-pinned ids still set from an earlier
 * selection — call `releaseSelectionPins` first when switching from one selection to another.
 */
export function pinForSelection(tracker, ids) {
  const selectionPinned = new Set(tracker.selectionPinned);
  for (const id of ids) {
    if (!tracker.userPinned.has(id)) selectionPinned.add(id);
  }
  return { selectionPinned, userPinned: tracker.userPinned };
}

/**
 * Deselect: every currently selection-pinned id should have its `fx`/`fy` released (the caller
 * does the actual DOM/node mutation; this just says WHICH ids and returns the tracker with the
 * selection-pinned set cleared). `userPinned` is untouched — by construction (see
 * `pinForSelection` above) it can never overlap with `selectionPinned`, so nothing here is ever
 * wrongly released.
 */
export function releaseSelectionPins(tracker) {
  return { released: new Set(tracker.selectionPinned), tracker: { selectionPinned: new Set(), userPinned: tracker.userPinned } };
}

/**
 * A user starts dragging a node that is CURRENTLY selection-pinned: "promotes" it to a user pin
 * (app.js's spec: "a user drag on a selection-pinned node should promote it to a user pin so
 * deselect no longer touches it") — removed from `selectionPinned` (a later deselect must not
 * release it) and added to `userPinned` (permanent until explicitly un-pinned, which this module
 * has no verb for — out of scope for this ticket). A no-op shape-wise if `id` wasn't
 * selection-pinned (still adds it to `userPinned`, since any drag-pin is a user pin).
 */
export function promoteToUserPin(tracker, id) {
  const selectionPinned = new Set(tracker.selectionPinned);
  selectionPinned.delete(id);
  const userPinned = new Set(tracker.userPinned);
  userPinned.add(id);
  return { selectionPinned, userPinned };
}
