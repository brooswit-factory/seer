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
//
// FACTORY-963/FACTORY-965 (director addendum, via FACTORY-966): idle and stalled swap roles
// again — idle moves off FACTORY-944's yellow to cyan, stalled moves off its orange/peach to
// yellow. working/blocked/none keep their FACTORY-944 hexes untouched. Both new tokens were
// found by brute-force search over colour-blind >=30 distance (public/colorblind.js, the same
// MIN_COLORBLIND_DISTANCE convention used throughout this repo), checked against every other
// agent fill in that theme AND every public/jira-status.js JIRA_STATUS_BORDERS value in that
// theme (fills have no contrast-vs-canvas floor to honour, unlike borders — see below). In
// Review's border is cyan in both themes (light #377488, dark #67e8f9), so idle-vs-In-Review was
// the real risk, not a hypothetical one: several plausible Catppuccin cyan accents (Mocha Sky
// #89dceb, Sapphire #74c7ec) fail that pairing outright under simulated dichromacy.
export const STATUS_COLORS = Object.freeze({
  light: Object.freeze({
    working: "#40a02b", // green (Catppuccin Latte) — was yellow pre-FACTORY-944
    blocked: "#d20f39", // red (Catppuccin Latte) — unchanged role
    idle: "#04a5e5", // cyan (Catppuccin Latte "Sky") — was yellow pre-FACTORY-966. Clears every
    // other fill and every jira-status.js light-theme border by a wide margin (>= 83 colour-blind
    // distance, worst case vs In Review's cyan border #377488 — the pairing this hex choice was
    // actually checked against).
    stalled: "#df8e1d", // yellow (Catppuccin Latte "Yellow") — was orange pre-FACTORY-966. This
    // is the same amber PR #29 (FACTORY-944) rejected for Idle as "too close to Stalled's
    // orange" — that concern no longer applies now that Stalled itself is the yellow role, not
    // orange; verified >= 30 apart (worst case ~63, vs `blocked`) from every other fill/border in
    // this theme, including the new Idle cyan above.
    none: "#9ca0b0", // grey (Catppuccin Latte overlay0) — unchanged role
  }),
  dark: Object.freeze({
    working: "#a6e3a1", // green (Catppuccin Mocha) — was herdr Idle's hex pre-FACTORY-944
    blocked: "#f38ba8", // red (Catppuccin Mocha) — unchanged, herdr Blocked
    idle: "#acf0f6", // cyan — was yellow pre-FACTORY-966 (the hex below, now Stalled's). NOT a
    // Catppuccin Mocha accent: Mocha Sky (#89dceb) and Sapphire (#74c7ec) both fail the >= 30
    // colour-blind-distance floor against In Review's bright cyan border (#67e8f9) — a medium or
    // saturated cyan converges with it under simulated dichromacy. This pale, high-lightness cyan
    // was found by brute-force search and clears that pairing (and every other fill/border in
    // this theme) by >= 59.
    stalled: "#f9e2af", // yellow (Catppuccin Mocha "Yellow") — was Idle's hex pre-FACTORY-966,
    // reused here for Stalled's new role since it already cleared every distance check (worst
    // case ~54, vs `none`), including against the new Idle cyan above.
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
