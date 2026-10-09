// Node-size multiplier decision for FACTORY-890. A pure, DOM/D3-free module (same contract as
// shapes.js) so the (agentStatus x resourceType) size table is testable without a browser.
//
// Decision: `sizeActive` REPLACES `sizeBase` for a live-agent node — it is NOT stacked on top of
// it (manager-factory's confirmed reading of "8x": active nodes are 8x today's per-type size,
// not 16x). "Live agent" means the provider can report status AND that status is one of
// working/blocked/idle/stalled; `agentStatus: "none"` (which also covers butchr's "shelved"
// label) and `providerCanReportStatus: false` both keep the base multiplier.
//
// The multipliers apply to the LINEAR size (radius/side), per the ticket. `sizeForNode` (from
// shapes.js) returns an AREA in d3-symbol units, so scaling the linear size by `m` scales that
// area by `m * m`.

import { sizeForNode } from "./shapes.js";

export const LIVE_AGENT_STATUSES = Object.freeze(["working", "blocked", "idle", "stalled"]);

/** Whether a node has a live agent — the condition that earns the `active` multiplier instead of `base`. */
export function isLiveAgentNode(node) {
  return Boolean(node?.providerCanReportStatus) && LIVE_AGENT_STATUSES.includes(node?.agentStatus);
}

/** The linear-size multiplier for a node: `sizeConfig.active` for a live agent, `sizeConfig.base` otherwise. */
export function sizeMultiplierForNode(node, sizeConfig) {
  return isLiveAgentNode(node) ? sizeConfig.active : sizeConfig.base;
}

/** The node's final area (d3-symbol units): its per-type base area (shapes.js) scaled by the squared linear multiplier. */
export function scaledSizeForNode(node, sizeConfig) {
  const multiplier = sizeMultiplierForNode(node, sizeConfig);
  return sizeForNode(node) * multiplier * multiplier;
}
