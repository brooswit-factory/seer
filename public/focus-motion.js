// FACTORY-982 item 4: prefers-reduced-motion: reduce must apply a focus (or deselect) change as an
// instant jump — no alpha easing, no animation frames — by running the simulation synchronously to
// rest instead. Extracted from `public/app.js`'s `reheatFocusSimulation` into its own tiny, pure-ish
// module (same d3-force-shaped-input convention as `focus-force.js`) so the synchronous-tick
// contract itself is unit-testable against a REAL `d3-force` simulation (a devDependency, same
// convention `test/layout.test.ts` already uses), not just asserted by reading app.js's source.

/** Hard cap on manual `simulation.tick()` calls — prevents a pathological graph (e.g. alphaDecay set to 0) from looping forever if alpha somehow never reaches `alphaMin`. Same bound `test/layout.test.ts` uses to run a fresh simulation to rest. */
export const FOCUS_MAX_SYNC_TICKS = 1000;

/**
 * Stops `simulation`'s own internal timer-driven loop (so it fires no "tick"/"end" events, and
 * nothing double-steps), resets it to full alpha, then manually ticks it to rest — `alphaMin` or
 * `maxTicks`, whichever comes first. Returns the number of ticks actually taken, so a caller (or a
 * test) can tell a clean settle apart from one that hit the cap. Mutates `simulation` in place
 * (same as every d3-force method), and does NOT repaint — the caller (`app.js`'s
 * `reheatFocusSimulation`) is responsible for a single render pass afterward.
 */
export function settleSynchronously(simulation, { maxTicks = FOCUS_MAX_SYNC_TICKS } = {}) {
  simulation.alphaTarget(0);
  simulation.stop();
  simulation.alpha(1);
  let ticks = 0;
  while (simulation.alpha() > simulation.alphaMin() && ticks < maxTicks) {
    simulation.tick();
    ticks++;
  }
  return ticks;
}
