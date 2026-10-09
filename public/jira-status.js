// Jira-status fill palette (FACTORY-900): node FILL now encodes Jira workflow status, not agent
// status — agent status moved to the ring (see colors.js, unchanged, now used as the ring
// colour by app.js). This is the ONE place that decision lives, mirroring colors.js's own
// "one place" convention; a pure, DOM/D3-free module so the status->fill table and the
// colour-blind-distance test (test/jira-status.test.ts) can run without a browser.
//
// Five visibly distinct fills, chosen from an Okabe-Ito-derived, colour-blind-safe set (never
// relying on a red/green distinction): To Do (blue), Backlog (a muted/desaturated version of
// To Do — same hue family, lower saturation and contrast, reading as "quieter"), In Progress
// (vermillion/orange), In Review (reddish purple), Done (bluish green). A sixth, neutral grey
// covers both "non-Jira provider" and "custom status that matches no name or category below".
// Each theme's set is tuned so every fill is >= 3:1 against that theme's `--bg` (verified in
// test/jira-status.test.ts using the same WCAG math as contrast.js) and so every pairwise
// distance survives a protanopia/deuteranopia/tritanopia simulation (public/colorblind.js).
export const JIRA_FILL_TODO = "todo";
export const JIRA_FILL_BACKLOG = "backlog";
export const JIRA_FILL_IN_PROGRESS = "inprogress";
export const JIRA_FILL_IN_REVIEW = "inreview";
export const JIRA_FILL_DONE = "done";
export const JIRA_FILL_NEUTRAL = "neutral";

export const JIRA_STATUS_FILLS = Object.freeze({
  light: Object.freeze({
    [JIRA_FILL_TODO]: "#0072b2",
    [JIRA_FILL_BACKLOG]: "#577086",
    [JIRA_FILL_IN_PROGRESS]: "#d55e00",
    [JIRA_FILL_IN_REVIEW]: "#8c3a6b",
    [JIRA_FILL_DONE]: "#007a5e",
    [JIRA_FILL_NEUTRAL]: "#6c6f85",
  }),
  dark: Object.freeze({
    [JIRA_FILL_TODO]: "#89b4fa",
    [JIRA_FILL_BACKLOG]: "#5c6b80",
    [JIRA_FILL_IN_PROGRESS]: "#fab387",
    [JIRA_FILL_IN_REVIEW]: "#d68fc2",
    [JIRA_FILL_DONE]: "#2ce8a0",
    [JIRA_FILL_NEUTRAL]: "#a6adc8",
  }),
});

/** Exact Jira status display name -> fill key, case-insensitive. Anything else falls back by statusCategory. */
const STATUS_NAME_TO_FILL = {
  "to do": JIRA_FILL_TODO,
  backlog: JIRA_FILL_BACKLOG,
  "in progress": JIRA_FILL_IN_PROGRESS,
  "in review": JIRA_FILL_IN_REVIEW,
  done: JIRA_FILL_DONE,
};

/** A custom status's statusCategory.key -> fill key, per the ticket's required fallback (FACTORY-900 item 2). */
const CATEGORY_TO_FILL = {
  new: JIRA_FILL_TODO,
  indeterminate: JIRA_FILL_IN_PROGRESS,
  done: JIRA_FILL_DONE,
};

/** Fill key for a node `{ jiraStatus?: { name, category } }`. Never throws; absent/unrecognized -> neutral. */
export function jiraFillKeyForNode(node) {
  const status = node?.jiraStatus;
  if (!status) return JIRA_FILL_NEUTRAL;
  const byName = STATUS_NAME_TO_FILL[status.name?.toLowerCase?.() ?? ""];
  if (byName) return byName;
  return CATEGORY_TO_FILL[status.category] ?? JIRA_FILL_NEUTRAL;
}

/** Actual fill hex for a node in the given theme ("light" | "dark"). */
export function jiraFillForNode(node, theme) {
  const table = JIRA_STATUS_FILLS[theme] ?? JIRA_STATUS_FILLS.light;
  return table[jiraFillKeyForNode(node)];
}

/** Human label for the legend/tooltip: the real Jira status name when known, else "no Jira status". */
export function jiraStatusLabel(node) {
  return node?.jiraStatus?.name ?? "no Jira status";
}
