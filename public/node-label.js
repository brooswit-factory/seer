// Two-line node label decision for FACTORY-970/FACTORY-968: line 1 is the node's own key, line 2
// is the label with that key prefix stripped (muted, ~80% size). A pure, DOM/D3-free module (same
// contract as shapes.js/node-scale.js/project.js) so the key/name split, per-line truncation, and
// vertical offsets are all testable without a browser.

/**
 * Characters-per-pixel-of-radius for line 1 (10px font) — chosen so a default-size node's line 1
 * truncates at roughly the same length the old single-line `LABEL_MAX_CHARS` (22) did. Scaling by
 * the node's own `approxRadiusForNode` means a larger node (Epic) gets more room and a smaller
 * one (Sub-task) gets less, per the ticket's "use approxRadiusForNode for each line's width
 * budget".
 */
export const CHARS_PER_RADIUS_PX = 3;

/** Floor so a tiny node still shows a few characters rather than truncating to nothing. */
export const MIN_LABEL_CHARS = 3;

/** Line 2's font-size relative to line 1's (ticket: "~80% size") — a smaller font also fits more characters in the same pixel width, so this scales line 2's own character budget too. */
export const LINE2_FONT_SCALE = 0.8;

/** Gap (px) from the node's own radius to line 1's baseline — unchanged from the pre-two-line single-line text's `dy`. */
export const LINE1_GAP_PX = 12;

/** Baseline-to-baseline distance (px) from line 1 to line 2 — "line 2 directly beneath" line 1. */
export const LINE_SPACING_PX = 10;

/** Allowance (px) below line 2's baseline for descenders (g, y, p, …) so a bbox built from `labelBottomExtent` safely contains the whole glyph, not just its baseline. */
export const LINE2_DESCENDER_PX = 2;

/** Max characters that fit a line at the given node radius and font-size scale (1 for line 1, `LINE2_FONT_SCALE` for line 2), floored at `MIN_LABEL_CHARS`. */
export function maxCharsForRadius(radiusPx, fontScale = 1) {
  const chars = Math.round((radiusPx * CHARS_PER_RADIUS_PX) / fontScale);
  return Math.max(MIN_LABEL_CHARS, chars);
}

/** Truncates `text` to at most `maxChars`, ellipsis-terminated when it had to cut anything. Never throws on an empty string. */
export function truncateToChars(text, maxChars) {
  if (text.length <= maxChars) return text;
  if (maxChars <= 1) return "…";
  return text.slice(0, maxChars - 1) + "…";
}

/** Line 1's `dy` (px from the node centre) at the given node radius — today's single-line placement, kept as-is. */
export function line1Dy(radiusPx) {
  return radiusPx + LINE1_GAP_PX;
}

/** How far (px from the node centre) the two-line label's lowest pixel reaches — the bbox/fit-to-view extent a single-line label never needed to report. */
export function labelBottomExtent(radiusPx) {
  return line1Dy(radiusPx) + LINE_SPACING_PX + LINE2_DESCENDER_PX;
}

/**
 * Splits a node into its two label lines' raw (untruncated) text:
 * - `key`: the node id's own key segment — everything after the id's LAST `:` (`jira-work:
 *   FACTORY-946` -> `FACTORY-946`; a project node's `jira-project:FACTORY` -> `FACTORY`), or the
 *   whole id when it carries no `:` at all — a hypothetical non-Jira provider id with no
 *   provider:key split has no narrower "key" to extract, so its own short form IS the id.
 * - `name`: `label` with that key stripped as a PREFIX only — collect.ts's Jira-issue label is
 *   `"<key>: <summary>"`, its project label is `"<key> <name>"` (both key-then-separator-then-
 *   rest) — so only a literal prefix match is stripped, any later occurrence of the key substring
 *   elsewhere in the label is left untouched.
 */
export function splitNodeLabel(node) {
  const id = node?.id ?? "";
  const label = node?.label ?? "";
  const lastColon = id.lastIndexOf(":");
  const key = lastColon === -1 ? id : id.slice(lastColon + 1);
  const name = key && label.startsWith(key) ? label.slice(key.length).replace(/^[:\s]+/, "") : label;
  return { key, name };
}
