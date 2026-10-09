import { describe, expect, test } from "bun:test";
import { CANNOT_REPORT_COLOR, STATUS_COLORS, colorForNode, outlineForNode, statusLabel } from "../public/colors.js";

// FACTORY-944/FACTORY-943: Brooswit's requested agent-status fill palette, REPLACING the
// FACTORY-841 herdr-verified table this file used to pin — working/idle are swapped (working is
// now green, idle is now yellow); blocked/stalled/none are unchanged in both role and hex. See
// public/colors.js's header comment for the light/dark Catppuccin source tokens.
const EXPECTED = {
  light: {
    working: "#40a02b",
    blocked: "#d20f39",
    idle: "#df8e1d",
    stalled: "#fe640b",
    none: "#9ca0b0",
  },
  dark: {
    working: "#a6e3a1",
    blocked: "#f38ba8",
    idle: "#f9e2af",
    stalled: "#fab387",
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
