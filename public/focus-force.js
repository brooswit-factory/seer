// FACTORY-982 item 1: on select, every non-focus node is pushed radially away from the focus
// group (selected node + its neighbours, public/selection.js's `neighboursOf`) so the focus group
// reads clearly against the rest of the graph. A pure, D3/DOM-free module — same contract as
// selection.js/colors.js/shapes.js — so the push math is testable without a live force simulation;
// `createFocusForce` below is the thin d3-force-shaped wrapper `public/app.js` actually installs.
//
// DESIGN (documented in the PR description too): a single-centroid radial falloff, not an
// all-pairs repulsion — O(n) per tick (one distance calc per non-focus node against one point),
// never O(n^2). A node sitting at/inside the focus group's own radius gets pushed the full capped
// distance; the push fades linearly to zero by FOCUS_FALLOFF_RADIUS_RATIO x the focus radius (a
// node already well clear of the focus group doesn't need to move further) — so the cap is a
// structural property of the falloff (push can never exceed it), not a separate clamp bolted on.

/** Push-strength: how fast a non-focus node's velocity is nudged toward its (capped) target position each tick — same "ease toward a target" shape `d3.forceX`/`forceY` use (app.js:604-605), not an instant teleport. */
export const FOCUS_PUSH_STRENGTH = 0.3;
/** Cap on how far a non-focus node's push target can sit beyond its own pre-select ("base") position, as a multiple of the live focus-group radius — the spec's own "~1.5x the focus group's radius" example. */
export const FOCUS_MAX_DISPLACEMENT_RATIO = 1.5;
/** Falloff radius, as a multiple of the focus-group radius, beyond which a non-focus node gets ~0 extra push (it's already clear of the focus group). */
export const FOCUS_FALLOFF_RADIUS_RATIO = 3;
/** Floor for the focus-group radius itself (px) — keeps the push/falloff sane when the focus group is a single node (radius 0) or two nodes sitting on top of each other. */
export const FOCUS_MIN_GROUP_RADIUS = 20;

/** Centroid of a list of `{x, y}`-shaped points. `{x: 0, y: 0}` for an empty list (never called that way by `focusTargets` below, but kept total for direct testing). */
export function centroidOf(points) {
  if (points.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

/** The focus group's own radius: the furthest any focus-group point sits from the centroid, floored at `FOCUS_MIN_GROUP_RADIUS`. */
export function groupRadius(points, centroid) {
  let max = 0;
  for (const p of points) {
    const d = Math.hypot(p.x - centroid.x, p.y - centroid.y);
    if (d > max) max = d;
  }
  return Math.max(max, FOCUS_MIN_GROUP_RADIUS);
}

/**
 * Pure: given every node's BASE (pre-select) position and the set of focus-group ids, returns a
 * `Map<nodeId, {x, y}>` of the push TARGET for every non-focus node — the position the focus force
 * eases each one toward. Zero focus ids (nothing selected) or an empty/absent focus group returns
 * an empty map, i.e. zero displacement for every node.
 */
export function focusTargets(nodes, focusIds, basePositions, { maxDisplacementRatio = FOCUS_MAX_DISPLACEMENT_RATIO, falloffRadiusRatio = FOCUS_FALLOFF_RADIUS_RATIO } = {}) {
  const targets = new Map();
  if (!focusIds || focusIds.size === 0) return targets;

  const focusPoints = nodes.filter((n) => focusIds.has(n.id)).map((n) => basePositions.get(n.id) ?? { x: n.x, y: n.y });
  if (focusPoints.length === 0) return targets;

  const centroid = centroidOf(focusPoints);
  const radius = groupRadius(focusPoints, centroid);
  const maxDisplacement = radius * maxDisplacementRatio;
  const falloffRadius = radius * falloffRadiusRatio;

  for (const n of nodes) {
    if (focusIds.has(n.id)) continue;
    const base = basePositions.get(n.id) ?? { x: n.x, y: n.y };
    const dx = base.x - centroid.x;
    const dy = base.y - centroid.y;
    const dist = Math.hypot(dx, dy);
    // A node sitting exactly on the centroid has no defined direction to push it in — pick an
    // arbitrary one (straight out along +x) rather than divide by zero; vanishingly rare in
    // practice (the centroid is a focus-group average, not usually any real node's own position).
    const ux = dist === 0 ? 1 : dx / dist;
    const uy = dist === 0 ? 0 : dy / dist;
    const proximity = Math.max(0, Math.min(1, 1 - dist / falloffRadius));
    const push = proximity * maxDisplacement;
    targets.set(n.id, { x: base.x + ux * push, y: base.y + uy * push });
  }
  return targets;
}

/**
 * The live d3-force: same `{initialize(nodes), (alpha) => void}` shape every builtin
 * `d3.forceX`/`forceManyBody`/etc. implements (app.js:598-609 installs it as `simulation.force("focus", ...)`
 * alongside them), so it participates in the existing tick loop rather than running its own.
 * `getFocusIds`/`getBasePositions` are read fresh on every tick (not captured once) so a
 * select/deselect takes effect immediately without re-creating the force.
 */
export function createFocusForce({ getFocusIds, getBasePositions, strength = FOCUS_PUSH_STRENGTH, maxDisplacementRatio = FOCUS_MAX_DISPLACEMENT_RATIO, falloffRadiusRatio = FOCUS_FALLOFF_RADIUS_RATIO }) {
  let nodes = [];
  function force(alpha) {
    const focusIds = getFocusIds();
    if (!focusIds || focusIds.size === 0) return;
    const basePositions = getBasePositions();
    const targets = focusTargets(nodes, focusIds, basePositions, { maxDisplacementRatio, falloffRadiusRatio });
    for (const n of nodes) {
      const target = targets.get(n.id);
      if (!target) continue;
      n.vx += (target.x - n.x) * strength * alpha;
      n.vy += (target.y - n.y) * strength * alpha;
    }
  }
  force.initialize = (_nodes) => {
    nodes = _nodes;
  };
  return force;
}
