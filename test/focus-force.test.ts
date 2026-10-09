import { describe, expect, test } from "bun:test";
import { centroidOf, groupRadius, focusTargets, createFocusForce, FOCUS_MIN_GROUP_RADIUS } from "../public/focus-force.js";

describe("centroidOf / groupRadius", () => {
  test("centroid of a single point is that point", () => {
    expect(centroidOf([{ x: 10, y: 20 }])).toEqual({ x: 10, y: 20 });
  });

  test("centroid averages multiple points", () => {
    expect(centroidOf([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }])).toEqual({ x: 5, y: 10 / 3 });
  });

  test("group radius is floored at FOCUS_MIN_GROUP_RADIUS for a tight/single-point group", () => {
    expect(groupRadius([{ x: 0, y: 0 }], { x: 0, y: 0 })).toBe(FOCUS_MIN_GROUP_RADIUS);
  });

  test("group radius is the furthest point from the centroid when that exceeds the floor", () => {
    const centroid = { x: 0, y: 0 };
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 30 }];
    expect(groupRadius(points, centroid)).toBe(100);
  });
});

describe("focusTargets (FACTORY-982 item 1's pure force math)", () => {
  const nodes = [
    { id: "focus-1", x: 0, y: 0 },
    { id: "focus-2", x: 10, y: 0 },
    { id: "far", x: 1000, y: 1000 },
    { id: "near-a", x: 5, y: 5 },
    { id: "near-b", x: -5, y: 5 },
  ];
  const focusIds = new Set(["focus-1", "focus-2"]);
  const basePositions = new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));

  test("zero displacement with no selection (empty focusIds)", () => {
    const targets = focusTargets(nodes, new Set(), basePositions);
    expect(targets.size).toBe(0);
  });

  test("displacement is computed ONLY for non-focus nodes", () => {
    const targets = focusTargets(nodes, focusIds, basePositions);
    expect(targets.has("focus-1")).toBe(false);
    expect(targets.has("focus-2")).toBe(false);
    expect(targets.has("far")).toBe(true);
    expect(targets.has("near-a")).toBe(true);
    expect(targets.has("near-b")).toBe(true);
  });

  test("pushes radially AWAY from the focus-group centroid", () => {
    // Centroid of focus-1/focus-2 is (5, 0). near-a sits at (5,5): straight "below" the centroid
    // in y only, so its target must move further in +y with no x change (same x as its base).
    const targets = focusTargets(nodes, focusIds, basePositions);
    const target = targets.get("near-a")!;
    expect(target.x).toBeCloseTo(5, 5);
    expect(target.y).toBeGreaterThan(5);
  });

  test("capped at the configured max displacement (never pushed further than maxDisplacementRatio x the focus-group radius)", () => {
    const targets = focusTargets(nodes, focusIds, basePositions, { maxDisplacementRatio: 1.5 });
    const centroid = centroidOf([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    const radius = groupRadius([{ x: 0, y: 0 }, { x: 10, y: 0 }], centroid);
    const maxDisplacement = radius * 1.5;
    for (const id of ["far", "near-a", "near-b"]) {
      const base = basePositions.get(id)!;
      const target = targets.get(id)!;
      const displacement = Math.hypot(target.x - base.x, target.y - base.y);
      expect(displacement).toBeLessThanOrEqual(maxDisplacement + 1e-6);
    }
  });

  test("a node already well beyond the falloff radius gets ~0 extra push", () => {
    const targets = focusTargets(nodes, focusIds, basePositions, { falloffRadiusRatio: 3 });
    const base = basePositions.get("far")!;
    const target = targets.get("far")!;
    expect(Math.hypot(target.x - base.x, target.y - base.y)).toBeCloseTo(0, 1);
  });

  test("deterministic for fixed inputs (same inputs, same outputs)", () => {
    const a = focusTargets(nodes, focusIds, basePositions);
    const b = focusTargets(nodes, focusIds, basePositions);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });
});

describe("createFocusForce (d3-force-shaped wrapper)", () => {
  test("exposes the {initialize, (alpha) => void} contract every d3 force uses", () => {
    const force = createFocusForce({ getFocusIds: () => new Set(), getBasePositions: () => new Map() });
    expect(typeof force).toBe("function");
    expect(typeof force.initialize).toBe("function");
  });

  test("a tick with no focus selected leaves every node's velocity untouched", () => {
    const nodes = [{ id: "a", x: 0, y: 0, vx: 0, vy: 0 }, { id: "b", x: 50, y: 0, vx: 0, vy: 0 }];
    const force = createFocusForce({ getFocusIds: () => new Set(), getBasePositions: () => new Map() });
    force.initialize(nodes);
    force(1);
    expect(nodes[0]!.vx).toBe(0);
    expect(nodes[0]!.vy).toBe(0);
    expect(nodes[1]!.vx).toBe(0);
    expect(nodes[1]!.vy).toBe(0);
  });

  test("a tick with an active selection nudges non-focus node velocity, leaves focus nodes untouched", () => {
    // "other" sits at 40px from the single-node focus group — inside the default falloff radius
    // (FOCUS_FALLOFF_RADIUS_RATIO x the FOCUS_MIN_GROUP_RADIUS floor of 20 = 60px), so it gets a
    // nonzero push; a node placed BEYOND the falloff radius correctly gets none (see focusTargets'
    // own "well beyond the falloff radius" test above) — this one is deliberately closer in.
    const nodes = [
      { id: "focus", x: 0, y: 0, vx: 0, vy: 0 },
      { id: "other", x: 40, y: 0, vx: 0, vy: 0 },
    ];
    const focusIds = new Set(["focus"]);
    const basePositions = new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    const force = createFocusForce({ getFocusIds: () => focusIds, getBasePositions: () => basePositions });
    force.initialize(nodes);
    force(1);
    expect(nodes[0]!.vx).toBe(0);
    expect(nodes[0]!.vy).toBe(0);
    expect(nodes[1]!.vx).not.toBe(0);
  });
});
