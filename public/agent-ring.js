// Agent-status ring (FACTORY-900 item 3): agent status moves from the node FILL to a thick
// ring/border drawn outside the fill, using colors.js's herdr colours UNCHANGED — this module
// only decides how to draw the ring (visible?, colour, width, dashed?), never re-choosing a
// colour itself. Pure and DOM/D3-free, like shapes.js and colors.js, so the ring decision is
// testable over every agentStatus without a browser.
import { colorForNode, outlineForNode } from "./colors.js";

/** Normal ring stroke width (px) — within the ticket's 3-4px band. */
export const RING_WIDTH = 3.5;
/** Thin-neutral ring width for the "cannot report status" case (still visibly a ring, not the full agent-status weight). */
export const RING_WIDTH_THIN = 1.5;

/**
 * How to draw a node's agent-status ring. `none` (provider reports and found no agent) draws NO
 * ring at all — the ticket's other option, a thin neutral ring, is reserved for "cannot report
 * status" instead, so the two already-distinguished "none-like" cases (colors.js's own
 * `outlineForNode`) stay visually distinct here too, not collapsed into one look.
 */
export function agentRingForNode(node) {
  if (node?.providerCanReportStatus && node?.agentStatus === "none") {
    return { visible: false };
  }
  const dashed = outlineForNode(node) === "dashed";
  return {
    visible: true,
    stroke: colorForNode(node),
    width: dashed ? RING_WIDTH_THIN : RING_WIDTH,
    dashed,
  };
}
