// Node-shape decision for FACTORY-876/FACTORY-878: shape carries resource TYPE, fill stays
// agent-status colour (`colors.js`, unchanged) — never hue for type, so the viewer stays
// colour-blind-safe. A pure, DOM/D3-free module so the type->shape table is testable without a
// browser: `app.js` maps each shape name here to an actual D3 symbol (or a custom path, for the
// two shapes — hexagon, roundedSquare — with no D3 builtin).
//
// Decision (recorded per FACTORY-876 item 3 — "pick and ship, don't ask"):
// - Known Jira issue types get their own distinct shape (epic largest, sub-task smallest, per
//   FACTORY-876's suggested size tiers).
// - An unrecognized/absent resourceType on a Jira-provider node (an unmapped custom issue type,
//   or old data with the field entirely absent) falls through to "other/unknown": roundedSquare.
// - Every non-Jira provider node gets ONE shared shape, "star" — ticket text offered "star or
//   cross"; star was picked. It is never reused by any Jira shape, so "non-Jira" stays visually
//   distinct from "other/unknown Jira type" too.
//
// Jira-ness is read off `node.provider`, not `node.resourceType` — resourceType is a free-form
// string non-Jira providers "set their own" value for for (FACTORY-876 scope item 2), so it
// cannot double as a reliable Jira/non-Jira discriminator. Every Jira source in this repo uses
// the provider key "jira-work" (see `JiraProviderOptions.providerKey`'s default); matching by
// prefix tolerates a renamed key without hard-coding the exact string twice.

import { isProjectNode, SHAPE_PROJECT, PROJECT_SIZE } from "./project.js";
import { outlineForNode } from "./colors.js";
import { jiraBorderForNode, jiraBorderHairlineForNode } from "./jira-status.js";

export const SHAPE_HEXAGON = "hexagon";
export const SHAPE_SQUARE = "square";
export const SHAPE_CIRCLE = "circle";
export const SHAPE_TRIANGLE = "triangle";
export const SHAPE_DIAMOND = "diamond";
export const SHAPE_ROUNDED_SQUARE = "roundedSquare";
export const SHAPE_STAR = "star";

/** Jira issue-type name -> shape. Exactly the five FACTORY-876 names each other test enumerates. */
export const JIRA_RESOURCE_TYPE_SHAPES = Object.freeze({
  Epic: SHAPE_HEXAGON,
  Story: SHAPE_SQUARE,
  Task: SHAPE_CIRCLE,
  Bug: SHAPE_TRIANGLE,
  "Sub-task": SHAPE_DIAMOND,
});

/** Relative size (D3 symbol area units — same convention `d3.symbol().size()` takes) per shape, largest-to-smallest per FACTORY-876's suggested tiering. */
export const SHAPE_SIZES = Object.freeze({
  [SHAPE_HEXAGON]: 260, // Epic — largest
  [SHAPE_SQUARE]: 200, // Story
  [SHAPE_CIRCLE]: 160, // Task
  [SHAPE_TRIANGLE]: 160, // Bug
  [SHAPE_ROUNDED_SQUARE]: 160, // other/unknown Jira type
  [SHAPE_STAR]: 160, // every non-Jira provider
  [SHAPE_DIAMOND]: 120, // Sub-task — smallest
});

function isJiraProvider(provider) {
  return typeof provider === "string" && provider.toLowerCase().startsWith("jira");
}

/**
 * Shape name for a node `{ provider, resourceType }`. Never throws on a missing/unknown field —
 * falls through to "other/unknown". A synthesised project node (FACTORY-911) is checked FIRST,
 * before the Jira-provider fallthrough below: its own provider key, "jira-project", would
 * otherwise match `isJiraProvider`'s `startsWith("jira")` and fall into the Jira resourceType
 * table (resourceType "project" is unmapped there, which would wrongly land it on
 * SHAPE_ROUNDED_SQUARE — a ticket-shape it must never share).
 */
export function shapeForNode(node) {
  if (isProjectNode(node)) return SHAPE_PROJECT;
  if (!isJiraProvider(node?.provider)) return SHAPE_STAR;
  const mapped = node?.resourceType ? JIRA_RESOURCE_TYPE_SHAPES[node.resourceType] : undefined;
  return mapped ?? SHAPE_ROUNDED_SQUARE;
}

/** Size for a node, derived from its shape — except a project node, which is a FIXED area (PROJECT_SIZE), never one of the per-type tiers. */
export function sizeForNode(node) {
  if (isProjectNode(node)) return PROJECT_SIZE;
  return SHAPE_SIZES[shapeForNode(node)];
}

/**
 * Jira-status BORDER decision for FACTORY-939 (retires public/agent-ring.js's circle-ring):
 * Jira status moves from the node fill to a thick stroke drawn as the shape's OWN outline — never
 * a separate ring element — so it composes with every shape, not just circular ones. The "cannot
 * report status" dashed-outline treatment (colors.js's `outlineForNode`) returns here exactly as
 * it drew pre-FACTORY-900: a dashed stroke on the shape itself, just now Jira-coloured instead of
 * the plain `--node-stroke` it used to be.
 */
export const BORDER_WIDTH = 3.5; // within the ticket's 3-4px band.

/**
 * Width (px) of the canvas-coloured gap FACTORY-944 item 3 requires between a node's fill and its
 * Jira-status border, so an outline never visually merges with a same-hue fill underneath it
 * (In Progress green on Working green, In Review yellow on Idle yellow) — within the ticket's
 * 1-2px band. Achieved not by painting an extra ring, but by drawing the FILL shape smaller than
 * the border's own path (see `fillInsetForNode`): the canvas naturally shows through the
 * resulting annulus, so there is nothing to keep in sync if the border width ever changes.
 */
export const BORDER_GAP_WIDTH = 2;

/**
 * How much smaller (px, off the approximate radius) a bordered node's FILL shape must be drawn
 * than the path used for its border stroke, so `BORDER_GAP_WIDTH`px of canvas shows between them
 * instead of the border stroke straddling the fill's edge (its inner half would otherwise paint
 * directly over the fill, leaving no gap at all). `BORDER_GAP_WIDTH` plus half the border's own
 * width: enough that the border stroke's inward-facing half lands entirely outside the shrunk
 * fill, with exactly `BORDER_GAP_WIDTH`px of untouched canvas left over between the two. Zero for
 * a project node (FACTORY-911): it draws no border, so its fill is never inset.
 */
export function fillInsetForNode(node) {
  if (isProjectNode(node)) return 0;
  return BORDER_GAP_WIDTH + BORDER_WIDTH / 2;
}

/**
 * How to draw a node's Jira-status border. A project node (FACTORY-911) has no Jira workflow
 * status of its own (it's a container, not a ticket) and never draws one — checked first, same
 * as every other project-node opt-out in this file.
 *
 * `gapColor`, when non-null (FACTORY-944 item 1: dark-theme "To Do" only — see jira-status.js's
 * `jiraBorderHairlineForNode`), REPLACES the plain canvas colour that would otherwise show
 * through the `fillInsetForNode` gap with a light hairline instead: a canvas-coloured gap is
 * invisible against a near-black border that is ALREADY barely distinguishable from the dark
 * canvas, so that one cell needs an actually-visible ring there, not just empty space. Every
 * other border/theme leaves this `null`, meaning "just let the canvas show through" (app.js
 * fills the gap ring with `var(--bg)` in that case) — the ticket's "either a thin
 * canvas-coloured gap OR an inner light hairline" offered as alternatives for two different
 * problems (general adjacency vs. one colour's dark-canvas visibility), not stacked.
 */
export function borderForNode(node, theme) {
  if (isProjectNode(node)) return { visible: false };
  return {
    visible: true,
    stroke: jiraBorderForNode(node, theme),
    width: BORDER_WIDTH,
    dashed: outlineForNode(node) === "dashed",
    gapColor: jiraBorderHairlineForNode(node, theme),
  };
}

/**
 * Whether a node's query-hit dot (FACTORY-900 item 7's fixed-radius dot, app.js's
 * `DISCOVERY_DOT_RADIUS`) should be drawn. FACTORY-945 (Brooswit, via FACTORY-943's addendum)
 * FLIPPED this from marking a link-discovered node to marking a direct query hit — "dots on
 * those that the query hits, no dots on the others" — so it is true only for
 * `discovery === "query"`, never for `"link"` and never for a synthesised project node
 * (FACTORY-911), regardless of that node's own `discovery` value.
 */
export function shouldShowDiscoveryDot(node) {
  if (isProjectNode(node)) return false;
  return node?.discovery === "query";
}
