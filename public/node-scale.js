// Node-size multiplier decision for FACTORY-913. A pure, DOM/D3-free module (same contract as
// shapes.js) so the (resourceType x sizeConfig) table is testable without a browser.
//
// REPLACES FACTORY-890/900's (agentStatus x resourceType) table: live agents are now shown ONLY
// by the agent-status ring (agent-ring.js) — node size no longer bumps for a live agent at all.
// Instead, each of three Jira issue types that gets its own setting (Epic, Bug, Story) scales by
// its own configured multiplier; every other node — Task, Sub-task, any other/unknown Jira issue
// type, and every non-Jira provider node — scales by `sizeConfig.base`.
//
// The multipliers apply to the LINEAR size (radius/side), per the ticket. `sizeForNode` (from
// shapes.js) returns an AREA in d3-symbol units, so scaling the linear size by `m` scales that
// area by `m * m`.

import { sizeForNode } from "./shapes.js";

/** Jira issue-type name -> the `sizeConfig` key that type's multiplier lives under. Absent for every type that falls through to `base`. */
const SIZE_CONFIG_KEY_BY_RESOURCE_TYPE = Object.freeze({
  Epic: "epic",
  Bug: "bug",
  Story: "story",
});

function isJiraProvider(provider) {
  return typeof provider === "string" && provider.toLowerCase().startsWith("jira");
}

/**
 * The linear-size multiplier for a node: `sizeConfig.epic`/`bug`/`story` for a Jira node of that
 * resource type, `sizeConfig.base` for everything else — Task, Sub-task, any other/unknown Jira
 * issue type, and every non-Jira provider node (whose own free-form `resourceType` never keys
 * into this table, matching `shapes.js`'s Jira/non-Jira split).
 */
export function sizeMultiplierForNode(node, sizeConfig) {
  const key = isJiraProvider(node?.provider) && node?.resourceType ? SIZE_CONFIG_KEY_BY_RESOURCE_TYPE[node.resourceType] : undefined;
  return sizeConfig[key ?? "base"];
}

/** The node's final area (d3-symbol units): its per-type base area (shapes.js) scaled by the squared linear multiplier. */
export function scaledSizeForNode(node, sizeConfig) {
  const multiplier = sizeMultiplierForNode(node, sizeConfig);
  return sizeForNode(node) * multiplier * multiplier;
}
