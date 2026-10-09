// Agent-status pulse decision for FACTORY-975/FACTORY-974: WORKING agents pulse the node's own
// fill shape (`path.node-shape`) INWARD (light attention); STALLED and BLOCKED agents pulse the
// Jira-status border (`path.node-border-ring`/`path.node-border-gap`) OUTWARD instead, heavier
// than working and BLOCKED heavier than STALLED; idle/none/unrecognized stays static. A pure,
// DOM/D3-free module (same contract as shapes.js/colors.js/node-label.js) so the status->class
// decision and the deterministic per-node stagger are testable without a browser — `app.js`
// toggles these class names on the relevant SVG elements every render pass (entered AND merged,
// so a status change on refresh swaps the class in place with no full re-render required) and
// sets the stagger as a `--pulse-delay` CSS custom property; the actual pulsing is pure CSS
// `@keyframes` (public/style.css) — nothing here drives a per-frame render loop.

/** Applied to `path.node-shape` only — body scales inward. Border classes below are never combined with this one on the same element. */
export const PULSE_BODY_WORKING = "pulse-body-working";
/** Applied to `path.node-border-ring` AND `path.node-border-gap` — both scale together so the ring and its canvas gap grow outward as one unit. */
export const PULSE_BORDER_STALLED = "pulse-border-stalled";
/** Heavier/faster than `PULSE_BORDER_STALLED` — same two elements. */
export const PULSE_BORDER_BLOCKED = "pulse-border-blocked";

/** "body" | "border" | null — which layer (if any) `animationClassFor` would pulse for this node, independent of the exact class name. */
export function animationTargetFor(node) {
  const status = node?.agentStatus;
  if (status === "working") return "body";
  if (status === "stalled" || status === "blocked") return "border";
  return null;
}

/** The single pulse class a node should carry, or `null` for idle/none/unrecognized/missing status — never throws on a missing/malformed node. */
export function animationClassFor(node) {
  const status = node?.agentStatus;
  if (status === "working") return PULSE_BODY_WORKING;
  if (status === "stalled") return PULSE_BORDER_STALLED;
  if (status === "blocked") return PULSE_BORDER_BLOCKED;
  return null;
}

/** Relative attention ordering (ticket: "BLOCKED heavier than STALLED", both heavier than "working"), 0 for anything that doesn't animate. Not used by `app.js` directly — exists so the ordering itself is assertable in tests without re-deriving it from CSS period/scale values. */
const INTENSITY = Object.freeze({ working: 1, stalled: 2, blocked: 3 });
export function animationIntensity(agentStatus) {
  return INTENSITY[agentStatus] ?? 0;
}

/**
 * Deterministic stagger delay (ms) for a node, derived purely from its id — same id always
 * yields the same delay (no randomness, no mutable counter), so nodes don't all pulse in lockstep
 * but a given node's phase doesn't jump around on every refresh either. A simple multiplicative
 * string hash (FNV-ish), not cryptographic — this only needs to decorrelate phases, not resist
 * collisions.
 */
export function staggerDelayMs(nodeId, maxDelayMs = 2000) {
  const id = String(nodeId ?? "");
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (Math.imul(hash, 31) + id.charCodeAt(i)) >>> 0;
  }
  return maxDelayMs <= 0 ? 0 : hash % maxDelayMs;
}
