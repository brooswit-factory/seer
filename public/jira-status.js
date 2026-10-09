// Jira-status BORDER palette (FACTORY-944/FACTORY-943, recolouring FACTORY-939's hue set): node
// fill encodes AGENT status (see colors.js) — Jira workflow status stays on the node's own
// outline stroke (drawn by `public/shapes.js`'s `borderForNode`, which also folds in colors.js's
// `outlineForNode` dashed signal). This is the ONE place the Jira-status -> colour decision
// lives, mirroring colors.js's own "one place" convention; a pure, DOM/D3-free module so the
// status->colour table and the colour-blind-distance test (test/jira-status.test.ts) can run
// without a browser.
//
// FACTORY-944 exact colours (Brooswit, via FACTORY-943's addendum): To Do = black, Backlog =
// grey, In Progress = green, In Review = yellow, Done = blue — REPLACING FACTORY-939's
// Okabe-Ito-derived blue/muted-blue/vermillion/purple/teal-green set below. A seventh, neutral
// grey (distinct from Backlog's grey) still covers "non-Jira provider" and "custom status
// matching no name or category below".
//
// FACTORY-939's stroke-contrast floor (>= 4.5:1 against that theme's `--bg`, tighter than
// FACTORY-900's >= 3:1 fill floor, verified in test/jira-status.test.ts using contrast.js's math)
// is KEPT for every token EXCEPT dark-theme "To Do": FACTORY-944's own requirement 2 scopes that
// floor to "blue/green/yellow" tokens only, deliberately not black — true black (or near-black)
// cannot itself clear 4.5:1 against a dark canvas by construction (a light-enough grey to do so
// would no longer read as "black"). Instead, dark-theme "To Do" keeps a near-black token
// (`#11111b`, Catppuccin "crust" — darker even than the dark canvas) and relies on
// `jiraBorderHairlineForNode`'s thin light hairline (drawn by shapes.js/app.js as a second,
// slightly wider stroke underneath) to stay visible against the dark canvas instead of contrast
// ratio; see test/jira-status.test.ts's explicit carve-out comment on that one cell.
//
// Colour-blind-distinguishable (public/colorblind.js), both from each other and from every
// colors.js agent-fill colour a border can now sit directly against (border-vs-fill adjacency) —
// including the new green-on-green (In Progress border vs Working fill) and yellow-on-yellow (In
// Review border vs Idle fill) pairs FACTORY-944 introduces: each pair uses a visibly different
// shade of the same hue family, verified >= 30 apart (public/colorblind.js's distance floor)
// under every simulated dichromacy type, not just normal vision — see test/jira-status.test.ts.
import { isProjectNode, projectFill } from "./project.js";

export const JIRA_BORDER_TODO = "todo";
export const JIRA_BORDER_BACKLOG = "backlog";
export const JIRA_BORDER_IN_PROGRESS = "inprogress";
export const JIRA_BORDER_IN_REVIEW = "inreview";
export const JIRA_BORDER_DONE = "done";
export const JIRA_BORDER_NEUTRAL = "neutral";

export const JIRA_STATUS_BORDERS = Object.freeze({
  light: Object.freeze({
    [JIRA_BORDER_TODO]: "#11111b", // near-black (Catppuccin "crust") — reads as black on the light canvas
    [JIRA_BORDER_BACKLOG]: "#6e6e6e", // grey — distinct shade from `neutral` below
    [JIRA_BORDER_IN_PROGRESS]: "#0b6e2e", // green
    [JIRA_BORDER_IN_REVIEW]: "#6b5205", // yellow/gold, darkened for light-canvas contrast
    [JIRA_BORDER_DONE]: "#1a56c4", // blue
    [JIRA_BORDER_NEUTRAL]: "#4a4a4a", // grey — non-Jira / unrecognized custom status
  }),
  dark: Object.freeze({
    [JIRA_BORDER_TODO]: "#11111b", // near-black; see the dark-mode hairline note above — exempt from the >=4.5:1 floor by design
    [JIRA_BORDER_BACKLOG]: "#a6a6a6", // grey — distinct shade from `neutral` below
    [JIRA_BORDER_IN_PROGRESS]: "#5fd97a", // green
    [JIRA_BORDER_IN_REVIEW]: "#e0c419", // yellow
    [JIRA_BORDER_DONE]: "#7aa2f7", // blue
    [JIRA_BORDER_NEUTRAL]: "#f4f4f4", // grey — non-Jira / unrecognized custom status
  }),
});

/** The thin light hairline drawn (as a second, wider stroke underneath — see shapes.js's `borderForNode`/app.js) behind dark-theme's near-black "To Do" border, so it still reads against the dark canvas instead of relying on contrast ratio. Matches contrast.js's `THEME_TOKENS.dark.nodeStroke`. */
export const JIRA_BORDER_DARK_HAIRLINE = "#cdd6f4";

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

/** `JIRA_BORDER_DARK_HAIRLINE` for a dark-theme "To Do" node (the only cell exempt from the contrast floor — see the module comment); `null` for every other node/theme, including project nodes, which never draw a Jira-status border at all. */
export function jiraBorderHairlineForNode(node, theme) {
  if (theme !== "dark") return null;
  if (isProjectNode(node)) return null;
  return jiraBorderKeyForNode(node) === JIRA_BORDER_TODO ? JIRA_BORDER_DARK_HAIRLINE : null;
}

/** Human label for the legend/tooltip: the real Jira status name when known, else "no Jira status". */
export function jiraStatusLabel(node) {
  return node?.jiraStatus?.name ?? "no Jira status";
}
