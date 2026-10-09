// Jira-status BORDER palette (FACTORY-939, reverting FACTORY-900's inversion): node fill encodes
// AGENT status again (see colors.js) — Jira workflow status moved to the node's own outline
// stroke (drawn by `public/shapes.js`'s `borderForNode`, which also folds in colors.js's
// `outlineForNode` dashed signal). This is the ONE place the Jira-status -> colour decision
// lives, mirroring colors.js's own "one place" convention; a pure, DOM/D3-free module so the
// status->colour table and the colour-blind-distance test (test/jira-status.test.ts) can run
// without a browser.
//
// Five visibly distinct colours, chosen from an Okabe-Ito-derived, colour-blind-safe set (never
// relying on a red/green distinction): To Do (blue), Backlog (a muted/desaturated version of To
// Do — same hue family, lower saturation and contrast, reading as "quieter"), In Progress
// (vermillion/orange), In Review (reddish purple), Done (bluish green). A sixth, neutral grey
// covers both "non-Jira provider" and "custom status that matches no name or category below".
//
// FACTORY-939: these are a thin 3-4px STROKE now, not a filled area, so each theme's set is tuned
// to clear >= 4.5:1 against that theme's `--bg` (the same stroke-contrast floor `--node-stroke`/
// `--edge`/`--arrowhead` already hold, verified in test/jira-status.test.ts using contrast.js's
// math) — tighter than FACTORY-900's >= 3:1 fill floor — AND to stay colour-blind-distinguishable
// (public/colorblind.js) both from each other and from every colors.js agent-fill colour a border
// can now sit directly against (border-vs-fill adjacency); a few hexes were nudged off their
// FACTORY-900 values for this (same hue family, just a different shade) — see
// test/jira-status.test.ts for the exact thresholds.
import { isProjectNode, projectFill } from "./project.js";

export const JIRA_BORDER_TODO = "todo";
export const JIRA_BORDER_BACKLOG = "backlog";
export const JIRA_BORDER_IN_PROGRESS = "inprogress";
export const JIRA_BORDER_IN_REVIEW = "inreview";
export const JIRA_BORDER_DONE = "done";
export const JIRA_BORDER_NEUTRAL = "neutral";

export const JIRA_STATUS_BORDERS = Object.freeze({
  light: Object.freeze({
    [JIRA_BORDER_TODO]: "#0072b2",
    [JIRA_BORDER_BACKLOG]: "#486c8a",
    [JIRA_BORDER_IN_PROGRESS]: "#b14e00",
    [JIRA_BORDER_IN_REVIEW]: "#8c3a6b",
    [JIRA_BORDER_DONE]: "#007a5e",
    [JIRA_BORDER_NEUTRAL]: "#515363",
  }),
  dark: Object.freeze({
    [JIRA_BORDER_TODO]: "#89b4fa",
    [JIRA_BORDER_BACKLOG]: "#7d8897",
    [JIRA_BORDER_IN_PROGRESS]: "#f99d65",
    [JIRA_BORDER_IN_REVIEW]: "#cb71b2",
    [JIRA_BORDER_DONE]: "#2ce8a0",
    [JIRA_BORDER_NEUTRAL]: "#bfc4d8",
  }),
});

/** Exact Jira status display name -> border key, case-insensitive. Anything else falls back by statusCategory. */
const STATUS_NAME_TO_BORDER = {
  "to do": JIRA_BORDER_TODO,
  backlog: JIRA_BORDER_BACKLOG,
  "in progress": JIRA_BORDER_IN_PROGRESS,
  "in review": JIRA_BORDER_IN_REVIEW,
  done: JIRA_BORDER_DONE,
};

/** A custom status's statusCategory.key -> border key, per the ticket's required fallback (FACTORY-900 item 2, carried over). */
const CATEGORY_TO_BORDER = {
  new: JIRA_BORDER_TODO,
  indeterminate: JIRA_BORDER_IN_PROGRESS,
  done: JIRA_BORDER_DONE,
};

/** Border key for a node `{ jiraStatus?: { name, category } }`. Never throws; absent/unrecognized -> neutral. */
export function jiraBorderKeyForNode(node) {
  const status = node?.jiraStatus;
  if (!status) return JIRA_BORDER_NEUTRAL;
  const byName = STATUS_NAME_TO_BORDER[status.name?.toLowerCase?.() ?? ""];
  if (byName) return byName;
  return CATEGORY_TO_BORDER[status.category] ?? JIRA_BORDER_NEUTRAL;
}

/** Actual border hex for a node in the given theme ("light" | "dark") — a project node (FACTORY-911) always gets its own fixed fill token instead and draws no border at all (see shapes.js's borderForNode), but this stays defensive the same way colorForNode/shapeForNode do. */
export function jiraBorderForNode(node, theme) {
  if (isProjectNode(node)) return projectFill(theme);
  const table = JIRA_STATUS_BORDERS[theme] ?? JIRA_STATUS_BORDERS.light;
  return table[jiraBorderKeyForNode(node)];
}

/** Human label for the legend/tooltip: the real Jira status name when known, else "no Jira status". */
export function jiraStatusLabel(node) {
  return node?.jiraStatus?.name ?? "no Jira status";
}
