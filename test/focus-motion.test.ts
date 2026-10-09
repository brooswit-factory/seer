// FACTORY-982 item 4: the prefers-reduced-motion synchronous-settle path, tested against a REAL
// `d3-force` simulation (the same devDependency `test/layout.test.ts` already uses to reproduce
// `public/app.js`'s exact force semantics headlessly), not just asserted by reading app.js's
// source — this is the actual "no animation frames, at rest immediately after" contract review
// asked for.
import { describe, expect, test } from "bun:test";
import { forceSimulation, forceX, forceY } from "d3-force";
import { settleSynchronously, FOCUS_MAX_SYNC_TICKS } from "../public/focus-motion.js";

function buildSimulation(nodeCount = 10) {
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({ id: `n${i}`, x: Math.cos(i) * 300, y: Math.sin(i) * 300 }));
  return forceSimulation(nodes)
    .force("x", forceX(0).strength(0.2))
    .force("y", forceY(0).strength(0.2))
    .stop();
}

describe("settleSynchronously", () => {
  test("leaves the simulation at rest (alpha <= alphaMin) immediately after returning", () => {
    const simulation = buildSimulation();
    settleSynchronously(simulation);
    expect(simulation.alpha()).toBeLessThanOrEqual(simulation.alphaMin());
  });

  test("fires no 'tick' or 'end' event — manual ticks, not the internal timer-driven loop", () => {
    const simulation = buildSimulation();
    let tickFired = false;
    let endFired = false;
    simulation.on("tick", () => (tickFired = true));
    simulation.on("end", () => (endFired = true));
    settleSynchronously(simulation);
    expect(tickFired).toBe(false);
    expect(endFired).toBe(false);
  });

  test("actually moves the nodes toward their settled positions (not a no-op)", () => {
    const simulation = buildSimulation();
    const before = simulation.nodes().map((n: any) => ({ x: n.x, y: n.y }));
    settleSynchronously(simulation);
    const after = simulation.nodes();
    const moved = after.some((n: any, i: number) => Math.hypot(n.x - before[i]!.x, n.y - before[i]!.y) > 1);
    expect(moved).toBe(true);
  });

  test("deterministic: settling twice from the same starting positions yields the same result", () => {
    const a = buildSimulation();
    const b = buildSimulation();
    settleSynchronously(a);
    settleSynchronously(b);
    expect(a.nodes().map((n: any) => ({ x: n.x, y: n.y }))).toEqual(b.nodes().map((n: any) => ({ x: n.x, y: n.y })));
  });

  test("caps at maxTicks for a pathological simulation that never reaches alphaMin on its own", () => {
    const simulation = buildSimulation().alphaDecay(0);
    const ticks = settleSynchronously(simulation, { maxTicks: 50 });
    expect(ticks).toBe(50);
  });

  test("default cap is FOCUS_MAX_SYNC_TICKS", () => {
    const simulation = buildSimulation().alphaDecay(0);
    const ticks = settleSynchronously(simulation);
    expect(ticks).toBe(FOCUS_MAX_SYNC_TICKS);
  });
});
