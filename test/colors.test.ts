import { describe, expect, test } from "bun:test";
import { CANNOT_REPORT_COLOR, STATUS_COLORS, colorForNode, outlineForNode, statusLabel } from "../public/colors.js";
import { COLORBLIND_TYPES, rgbDistance, simulateColorblind } from "../public/colorblind.js";

// FACTORY-963/FACTORY-965 (via FACTORY-966): idle and stalled swap roles again — idle moves off
// FACTORY-944's yellow to cyan, stalled moves off its orange/peach to yellow. working/blocked/none
// are unchanged in both role and hex (that was the FACTORY-944 swap, a different, earlier one).
// See public/colors.js's header comment for the light/dark source tokens and the colour-blind
// math each new hex was verified against.
const EXPECTED = {
  light: {
    working: "#40a02b",
    blocked: "#d20f39",
    idle: "#04a5e5",
    stalled: "#df8e1d",
    none: "#9ca0b0",
  },
  dark: {
    working: "#a6e3a1",
    blocked: "#f38ba8",
    idle: "#acf0f6",
    stalled: "#f9e2af",
    none: "#6c7086",
  },
};

describe("STATUS_COLORS", () => {
  test.each(["light", "dark"] as const)("matches the FACTORY-944 palette exactly (%s theme)", (theme) => {
    expect(STATUS_COLORS[theme]).toEqual(EXPECTED[theme] as typeof STATUS_COLORS.light);
  });

  test.each(["light", "dark"] as const)("the five keys are exactly butchr's agent:* status family (%s theme)", (theme) => {
    expect(Object.keys(STATUS_COLORS[theme]).sort()).toEqual(["blocked", "idle", "none", "stalled", "working"]);
  });

  test("CANNOT_REPORT_COLOR is the same neutral as `none`, in both themes", () => {
    expect(CANNOT_REPORT_COLOR.light).toBe(STATUS_COLORS.light.none);
    expect(CANNOT_REPORT_COLOR.dark).toBe(STATUS_COLORS.dark.none);
  });
});

describe("colorForNode / outlineForNode", () => {
  const working = { agentStatus: "working" as const, providerCanReportStatus: true };
  const cannotReport = { agentStatus: "none" as const, providerCanReportStatus: false };
  const reportsNone = { agentStatus: "none" as const, providerCanReportStatus: true };

  test.each(["light", "dark"] as const)("a reporting node gets its status colour and a solid outline (%s theme)", (theme) => {
    expect(colorForNode(working, theme)).toBe(STATUS_COLORS[theme].working);
    expect(outlineForNode(working)).toBe("solid");
  });

  for (const theme of ["light", "dark"] as const) {
    test.each(["working", "idle", "blocked", "stalled", "none"] as const)(
      `colorForNode returns the agent-status colour for every status, reporting provider (%s, ${theme} theme) — FACTORY-939 item 2/5, FACTORY-944 recolour`,
      (agentStatus) => {
        const node = { agentStatus, providerCanReportStatus: true };
        expect(colorForNode(node, theme)).toBe(STATUS_COLORS[theme][agentStatus]);
        expect(outlineForNode(node)).toBe("solid");
      },
    );
  }

  test.each(["light", "dark"] as const)("cannot-report and reports-none share the same neutral fill (%s theme)", (theme) => {
    expect(colorForNode(cannotReport, theme)).toBe(CANNOT_REPORT_COLOR[theme]);
    expect(colorForNode(reportsNone, theme)).toBe(STATUS_COLORS[theme].none);
    expect(colorForNode(cannotReport, theme)).toBe(colorForNode(reportsNone, theme));
  });

  test("but they are NOT drawn the same way — outline distinguishes them", () => {
    expect(outlineForNode(cannotReport)).toBe("dashed");
    expect(outlineForNode(reportsNone)).toBe("solid");
    expect(outlineForNode(cannotReport)).not.toBe(outlineForNode(reportsNone));
  });

  test("statusLabel reports the cannot-report case in words, not just a colour", () => {
    expect(statusLabel(cannotReport)).toBe("cannot report status");
    expect(statusLabel(reportsNone)).toBe("none");
  });
});

// PR #29 review item 2 (FACTORY-944): an earlier light-theme Idle hex read as "orange-ish",
// close enough to Stalled's then-orange to raise a colour-blind-safety question explicitly, not
// just by incidental coverage of some larger pairwise matrix (which would also flag Working/
// Blocked and Blocked/Stalled — a pre-existing red/green/orange tension in colours that ticket
// didn't touch at all, out of scope there). Named explicitly here (not just covered incidentally
// by the full border-vs-fill loop in test/jira-status.test.ts) so this pair keeps getting a
// pointed test even now that FACTORY-963/FACTORY-965 have reassigned both roles — idle is cyan
// and stalled is yellow, not yellow and orange — generic over STATUS_COLORS either way.
describe("Idle vs Stalled stay colour-blind-distinguishable (FACTORY-944, PR #29 review item 2; roles reassigned by FACTORY-963/FACTORY-965)", () => {
  test.each(["light", "dark"] as const)("%s theme", (theme) => {
    const idle = hexToRgb(STATUS_COLORS[theme].idle);
    const stalled = hexToRgb(STATUS_COLORS[theme].stalled);
    expect(rgbDistance(idle, stalled)).toBeGreaterThan(0);
    for (const type of COLORBLIND_TYPES) {
      const distance = rgbDistance(simulateColorblind(STATUS_COLORS[theme].idle, type), simulateColorblind(STATUS_COLORS[theme].stalled, type));
      expect(distance).toBeGreaterThanOrEqual(30);
    }
  });
});

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace(/^#/, "");
  return [parseInt(normalized.slice(0, 2), 16), parseInt(normalized.slice(2, 4), 16), parseInt(normalized.slice(4, 6), 16)];
}
