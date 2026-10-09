// The ONE place seer's node-colour decision lives (FACTORY-841 DECISIONS comment 31060,
// item 5; recoloured by FACTORY-944/FACTORY-943's addendum, which REPLACES the FACTORY-841
// herdr-verified table below: working/idle are no longer herdr's own yellow/green, they are
// Brooswit's requested green/yellow — see FACTORY-944 for the exact brief).
//
// This file is loaded directly by the browser (plain <script type="module">, no bundler) and
// is also imported as-is by test/colors.test.ts, so there is exactly one copy of this table.
//
// Theme tokens, light + dark (FACTORY-944 item 1 — mirrors jira-status.js's JIRA_STATUS_BORDERS
// light/dark split): dark uses the existing Catppuccin Mocha hexes (bright, legible on the dark
// `--bg`); light uses the Catppuccin Latte equivalents (deeper/more saturated, legible on the
// light `--bg`) rather than reusing the Mocha hexes verbatim on a light canvas.
export const STATUS_COLORS = Object.freeze({
  light: Object.freeze({
    working: "#40a02b", // green (Catppuccin Latte) — was yellow pre-FACTORY-944
    blocked: "#d20f39", // red (Catppuccin Latte) — unchanged role
    idle: "#ffe63c", // yellow — was green pre-FACTORY-944. A bright lemon yellow rather than
    // Catppuccin Latte's amber "yellow" (#df8e1d, too close to Stalled's orange under simulated
    // colour-blindness — PR #29 review item 2): fill has no contrast-vs-canvas floor to honour
    // (unlike the border palette), so nothing stops picking a clearly-yellow, clearly-not-orange
    // hue here; verified >= 30 apart from `stalled` under every simulated dichromacy type.
    stalled: "#fe640b", // orange (Catppuccin Latte) — unchanged role
    none: "#9ca0b0", // grey (Catppuccin Latte overlay0) — unchanged role
  }),
  dark: Object.freeze({
    working: "#a6e3a1", // green (Catppuccin Mocha) — was herdr Idle's hex pre-FACTORY-944
    blocked: "#f38ba8", // red (Catppuccin Mocha) — unchanged, herdr Blocked
    idle: "#f9e2af", // yellow (Catppuccin Mocha) — was herdr Working's hex pre-FACTORY-944
    stalled: "#fab387", // orange/peach (Catppuccin Mocha) — unchanged, no herdr counterpart
    none: "#6c7086", // grey (Catppuccin Mocha overlay0) — unchanged, herdr Unknown
  }),
});

/** Same neutral as `none` — "cannot report" and "reports none" mean the same thing to a reader, distinguished by outline, not a second grey. Theme tokens, same split as STATUS_COLORS. */
export const CANNOT_REPORT_COLOR = Object.freeze({
  light: STATUS_COLORS.light.none,
  dark: STATUS_COLORS.dark.none,
});

/** herdr Done -> teal. Reserved: no butchr `agent:*` status maps to it today. */
export const RESERVED_DONE_COLOR = "#94e2d5";

/** Fill colour for a node in the given theme ("light" | "dark"), honouring the "cannot report" vs "reports none" distinction (same colour; see `outlineForNode`). */
export function colorForNode(node, theme) {
  const colors = STATUS_COLORS[theme] ?? STATUS_COLORS.light;
  const cannotReport = CANNOT_REPORT_COLOR[theme] ?? CANNOT_REPORT_COLOR.light;
  if (!node.providerCanReportStatus) return cannotReport;
  return colors[node.agentStatus] ?? colors.none;
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
