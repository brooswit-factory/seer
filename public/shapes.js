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

/** Shape name for a node `{ provider, resourceType }`. Never throws on a missing/unknown field — falls through to "other/unknown". */
export function shapeForNode(node) {
  if (!isJiraProvider(node?.provider)) return SHAPE_STAR;
  const mapped = node?.resourceType ? JIRA_RESOURCE_TYPE_SHAPES[node.resourceType] : undefined;
  return mapped ?? SHAPE_ROUNDED_SQUARE;
}

/** Size for a node, derived from its shape. */
export function sizeForNode(node) {
  return SHAPE_SIZES[shapeForNode(node)];
}
