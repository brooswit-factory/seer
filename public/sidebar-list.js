// Left node-list sidebar: pure ordering + filtering (FACTORY-957 item 1). A DOM/D3-free module,
// same contract as shapes.js/sidebar-list.js's siblings, so the default ordering and the filter
// predicate are testable without a browser. `app.js` is the only caller — it feeds the live
// `nodes` array through `sortNodesForSidebar` then `filterNodesForSidebar` on every render.

import { isProjectNode } from "./project.js";

/**
 * Default order (FACTORY-957 item 1, the ticket's own list): Epic, Story, Task, Bug, "others"
 * (Sub-task, any other/unknown Jira issue type, every non-Jira provider node), then projects
 * last — a project is a synthesised container, not a ticket, so it reads as a different tier
 * from every real resource above it, same precedent `shapes.js`/`project.js` already set for
 * shape/size/colour. Within a tier, plain ascending `id` order (the ticket's "then key" — see the
 * PR description for why `id`, e.g. "jira-work:FACTORY-859", is what this sidebar treats as the
 * node's "key": the schema has no separate short-key field, and `id` already IS the same value
 * the tooltip/panel label as "id").
 */
const TYPE_TIER = Object.freeze({ Epic: 0, Story: 1, Task: 2, Bug: 3 });
const OTHER_TIER = 4;
const PROJECT_TIER = 5;

function tierForNode(node) {
  if (isProjectNode(node)) return PROJECT_TIER;
  return TYPE_TIER[node?.resourceType] ?? OTHER_TIER;
}

/** Returns a NEW array — never mutates `nodes` (the live simulation array app.js owns). */
export function sortNodesForSidebar(nodes) {
  return [...nodes].sort((a, b) => {
    const diff = tierForNode(a) - tierForNode(b);
    if (diff !== 0) return diff;
    return (a.id ?? "").localeCompare(b.id ?? "");
  });
}

/**
 * Case-insensitive substring match against `id` (the sidebar's "key") OR `label` — the ticket
 * leaves "filter matching" unspecified, this is the default picked (see PR description). An
 * empty/whitespace-only query matches everything (no filtering applied).
 */
export function filterNodesForSidebar(nodes, query) {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return nodes;
  return nodes.filter((n) => (n.id ?? "").toLowerCase().includes(q) || (n.label ?? "").toLowerCase().includes(q));
}
