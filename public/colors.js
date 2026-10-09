// The ONE place seer's node-colour decision lives (FACTORY-841 DECISIONS comment 31060,
// item 5). Hexes verified against herdr's own status->colour function (`status_color` in
// src/client/shell.rs) and its default Catppuccin Mocha `Palette` (src/app/state.rs) in a
// herdrdev/herdr checkout: herdr's AgentStatus enum has no "stalled" counterpart at all —
// "stalled" is seer/butchr's own decision, not herdr's, which is why it maps to peach rather
// than a verified herdr token.
//
// This file is loaded directly by the browser (plain <script type="module">, no bundler) and
// is also imported as-is by test/colors.test.ts, so there is exactly one copy of this table.

export const STATUS_COLORS = Object.freeze({
  working: "#f9e2af", // herdr Working -> yellow
  blocked: "#f38ba8", // herdr Blocked -> red
  idle: "#a6e3a1", // herdr Idle -> green
  stalled: "#fab387", // no herdr counterpart; decision: peach (herdr's "interrupted/warning" token)
  none: "#6c7086", // herdr Unknown -> overlay0
});

/** Same neutral as `none` — "cannot report" and "reports none" mean the same thing to a reader, distinguished by outline, not a second grey. */
export const CANNOT_REPORT_COLOR = "#6c7086";

/** herdr Done -> teal. Reserved: no butchr `agent:*` status maps to it today. */
export const RESERVED_DONE_COLOR = "#94e2d5";

/** Fill colour for a node, honouring the "cannot report" vs "reports none" distinction (same colour; see `outlineForNode`). */
export function colorForNode(node) {
  if (!node.providerCanReportStatus) return CANNOT_REPORT_COLOR;
  return STATUS_COLORS[node.agentStatus] ?? STATUS_COLORS.none;
}

/** "dashed" when the provider cannot report status at all; "solid" otherwise. Never a second grey fill. */
export function outlineForNode(node) {
  return node.providerCanReportStatus ? "solid" : "dashed";
}

/** Human words for a status, for the legend and tooltip. */
export function statusLabel(node) {
  if (!node.providerCanReportStatus) return "cannot report status";
  return node.agentStatus;
}
