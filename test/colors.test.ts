import { describe, expect, test } from "bun:test";
import { CANNOT_REPORT_COLOR, STATUS_COLORS, colorForNode, outlineForNode, statusLabel } from "../public/colors.js";

// Hexes verified against herdr's own `status_color` (src/client/shell.rs) and its default
// Catppuccin Mocha `Palette::default()` (src/app/state.rs) in a herdrdev/herdr checkout —
// see FACTORY-841 DECISIONS comment 31060, item 5, which this table must not silently diverge from.
const EXPECTED = {
  working: "#f9e2af",
  blocked: "#f38ba8",
  idle: "#a6e3a1",
  stalled: "#fab387",
  none: "#6c7086",
};

describe("STATUS_COLORS", () => {
  test("matches the FACTORY-841 decision-5 / herdr-verified palette exactly", () => {
    // `Object.freeze` in colors.js gives tsc literal-typed properties; widen the comparison
    // value's type rather than loosen the source module's own typing.
    expect(STATUS_COLORS).toEqual(EXPECTED as typeof STATUS_COLORS);
  });

  test("the five keys are exactly butchr's agent:* status family", () => {
    expect(Object.keys(STATUS_COLORS).sort()).toEqual(["blocked", "idle", "none", "stalled", "working"]);
  });
});

describe("colorForNode / outlineForNode", () => {
  const working = { agentStatus: "working" as const, providerCanReportStatus: true };
  const cannotReport = { agentStatus: "none" as const, providerCanReportStatus: false };
  const reportsNone = { agentStatus: "none" as const, providerCanReportStatus: true };

  test("a reporting node gets its status colour and a solid outline", () => {
    expect(colorForNode(working)).toBe(STATUS_COLORS.working);
    expect(outlineForNode(working)).toBe("solid");
  });

  test("cannot-report and reports-none share the same neutral fill", () => {
    expect(colorForNode(cannotReport)).toBe(CANNOT_REPORT_COLOR);
    expect(colorForNode(reportsNone)).toBe(STATUS_COLORS.none);
    expect(colorForNode(cannotReport)).toBe(colorForNode(reportsNone));
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
