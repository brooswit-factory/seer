// Selection-state reducer (FACTORY-957 item 2): a pure, DOM/D3-free module — same contract as
// colors.js/shapes.js/project.js/fit-view.js — so "which node is selected" is testable without a
// browser or a D3 simulation. app.js is the only caller: it holds one `SelectionState` value and
// replaces it on every graph click, list click, deselect, and refresh.
//
// Selection is tracked by node id, not by object reference or array index, so it survives
// `apply(graph)` rebuilding/reordering the live `nodes` array on every poll (FACTORY-875's
// mutate-in-place convention) — `reconcileSelection` is what clears it automatically once the
// selected id no longer appears in the latest graph.

/** `{ selectedId: string | null }` — the entire state shape. `null` means "nothing selected: show the legend". */
export function createSelectionState() {
  return { selectedId: null };
}

/** Selects a node by id — same reducer whether the click came from the graph or the list (FACTORY-957 item 2's "select (graph click or list click)"). Re-selecting the already-selected id is a no-op value-wise (still returns a fresh object, cheap and simpler than special-casing it). */
export function select(state, nodeId) {
  if (nodeId == null) throw new Error("select: nodeId is required — use deselect() to clear");
  return { selectedId: nodeId };
}

/** Clears the selection — empty-canvas click or the panel's close control. */
export function deselect(_state) {
  return { selectedId: null };
}

/**
 * Refresh-safe reconciliation: called after every `apply(graph)` with the set of node ids present
 * in the just-applied graph. Returns a value-equal `state` unchanged (so callers can cheaply
 * compare by reference to skip redundant UI work) when the selection is still present or already
 * empty; returns a freshly-deselected state when the selected node has disappeared.
 */
export function reconcileSelection(state, presentNodeIds) {
  if (state.selectedId == null) return state;
  if (presentNodeIds.has(state.selectedId)) return state;
  return deselect(state);
}
