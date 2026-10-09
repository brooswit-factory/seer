import { describe, expect, test } from "bun:test";
import {
  PULSE_BODY_WORKING,
  PULSE_BORDER_BLOCKED,
  PULSE_BORDER_STALLED,
  animationClassFor,
  animationIntensity,
  animationTargetFor,
  staggerDelayMs,
} from "../public/agent-animation.js";

describe("animationClassFor / animationTargetFor", () => {
  const cases: Array<[string, unknown, string | null, string | null]> = [
    ["working animates the body", { agentStatus: "working" }, PULSE_BODY_WORKING, "body"],
    ["stalled animates the border", { agentStatus: "stalled" }, PULSE_BORDER_STALLED, "border"],
    ["blocked animates the border", { agentStatus: "blocked" }, PULSE_BORDER_BLOCKED, "border"],
    ["idle is static", { agentStatus: "idle" }, null, null],
    ["none is static", { agentStatus: "none" }, null, null],
    ["an unrecognized status is static", { agentStatus: "something-else" }, null, null],
    ["a missing agentStatus is static", {}, null, null],
    ["a null node is static, never throws", null, null, null],
    ["an undefined node is static, never throws", undefined, null, null],
  ];

  for (const [name, node, expectedClass, expectedTarget] of cases) {
    test(name, () => {
      expect(animationClassFor(node)).toBe(expectedClass);
      expect(animationTargetFor(node)).toBe(expectedTarget);
    });
  }
});

describe("animationIntensity", () => {
  test("blocked > stalled > working > static", () => {
    const blocked = animationIntensity("blocked");
    const stalled = animationIntensity("stalled");
    const working = animationIntensity("working");
    const idle = animationIntensity("idle");
    expect(blocked).toBeGreaterThan(stalled);
    expect(stalled).toBeGreaterThan(working);
    expect(working).toBeGreaterThan(idle);
    expect(idle).toBe(0);
  });

  test("unrecognized/missing status is the same zero intensity as idle", () => {
    expect(animationIntensity("none")).toBe(0);
    expect(animationIntensity(undefined)).toBe(0);
  });
});

describe("staggerDelayMs", () => {
  test("is a pure function of the node id: same id, same delay, every time", () => {
    const a = staggerDelayMs("jira-work:FACTORY-946");
    const b = staggerDelayMs("jira-work:FACTORY-946");
    const c = staggerDelayMs("jira-work:FACTORY-946");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  test("different ids generally produce different delays (decorrelated stagger, not lockstep)", () => {
    const ids = ["jira-work:FACTORY-1", "jira-work:FACTORY-2", "jira-work:FACTORY-3", "jira-work:FACTORY-4", "jira-work:FACTORY-5"];
    const delays = new Set(ids.map((id) => staggerDelayMs(id)));
    expect(delays.size).toBeGreaterThan(1);
  });

  test("always within [0, maxDelayMs)", () => {
    for (const id of ["a", "jira-work:FACTORY-999", "", "slack-general", "x".repeat(50)]) {
      const delay = staggerDelayMs(id, 2000);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThan(2000);
    }
  });

  test("never throws on a missing/non-string id", () => {
    expect(() => staggerDelayMs(undefined)).not.toThrow();
    expect(() => staggerDelayMs(null)).not.toThrow();
    expect(staggerDelayMs(undefined)).toBe(staggerDelayMs(undefined));
  });

  test("respects a custom maxDelayMs", () => {
    for (let i = 0; i < 20; i++) {
      const delay = staggerDelayMs(`node-${i}`, 500);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThan(500);
    }
  });
});

describe("status change on refresh swaps the animation class in place", () => {
  test("re-evaluating the same node object after its agentStatus mutates yields the new class immediately", () => {
    // app.js re-runs animationClassFor(d) on every render pass over the SAME mutated node object
    // (apply() does `Object.assign(existing, incoming)` rather than replacing it) — this is the
    // pure-function-level equivalent of that in-place status swap, without needing a DOM.
    const node: { id: string; agentStatus: string } = { id: "jira-work:FACTORY-1", agentStatus: "working" };
    expect(animationClassFor(node)).toBe(PULSE_BODY_WORKING);

    node.agentStatus = "blocked";
    expect(animationClassFor(node)).toBe(PULSE_BORDER_BLOCKED);

    node.agentStatus = "idle";
    expect(animationClassFor(node)).toBe(null);
  });
});
