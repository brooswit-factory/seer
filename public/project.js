// Project-node decision for FACTORY-911: a synthesised Jira project node is not a ticket, so it
// opts out of every ticket-shaped rule — type shape, Jira-status fill, agent-status ring, and the
// SEER_SIZE_BASE/ACTIVE multiplier — and gets its own fixed look instead. A pure, DOM/D3-free
// module (same contract as shapes.js/node-scale.js/colors.js) so the decision is testable without
// a browser.
//
// `isProjectNode` checks `provider` (not `resourceType` alone): the collector always sets both
// together (src/collector/collect.ts), but `resourceType` is a free-form string a Jira CUSTOM
// issue type could theoretically also set to "project" — matching on the collector's own fixed
// provider key avoids that false positive.

export const PROJECT_PROVIDER = "jira-project";
export const PROJECT_RESOURCE_TYPE = "project";

/** A D3 symbol with no builtin ticket-shape overlap (shapes.js already uses hexagon/square/circle/triangle/diamond/roundedSquare/star). */
export const SHAPE_PROJECT = "wye";

/** Fixed D3-symbol-units area — deliberately larger than any ticket shape (shapes.js's largest, Epic's hexagon, is 260) so a project always reads as the "container", never sized by SEER_SIZE_BASE/ACTIVE. */
export const PROJECT_SIZE = 340;

/** `contains` edges (project -> Epic) use this instead of the layout's own SEER_LINK_DISTANCE, so a project's Epics cluster near it rather than spreading across the whole canvas. */
export const PROJECT_LINK_DISTANCE = 30;

/**
 * Fixed fill token, light + dark (Catppuccin mauve, picked because it is unused by both
 * colors.js's agent-status set and jira-status.js's Jira-status set): verified >= 3:1 against
 * `--bg` in both themes (contrast.js math) — light #8839ef vs #eff1f5 = 4.79:1, dark #cba6f7 vs
 * #1e1e2e = 8.07:1.
 */
export const PROJECT_FILL = Object.freeze({
  light: "#8839ef",
  dark: "#cba6f7",
});

/** Whether a node is a synthesised project node. Never throws on a missing/malformed node. */
export function isProjectNode(node) {
  return node?.provider === PROJECT_PROVIDER;
}

/** Fixed fill hex for a project node in the given theme ("light" | "dark"). */
export function projectFill(theme) {
  return PROJECT_FILL[theme] ?? PROJECT_FILL.light;
}
