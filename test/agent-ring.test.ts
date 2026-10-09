import { describe, expect, test } from "bun:test";
import { agentRingForNode, RING_WIDTH, RING_WIDTH_THIN } from "../public/agent-ring.js";
import { CANNOT_REPORT_COLOR, STATUS_COLORS } from "../public/colors.js";

const AGENT_STATUSES = ["working", "idle", "blocked", "stalled", "none"];

describe("agentRingForNode: table-driven over every agentStatus x providerCanReportStatus", () => {
  test.each(AGENT_STATUSES)('agentStatus "%s", reporting provider', (agentStatus) => {
    const ring = agentRingForNode({ agentStatus, providerCanReportStatus: true });
    if (agentStatus === "none") {
      // The ticket's "none/no agent" option this module picked: no ring at all.
      expect(ring.visible).toBe(false);
    } else {
      expect(ring.visible).toBe(true);
      expect(ring.stroke).toBe(STATUS_COLORS[agentStatus as keyof typeof STATUS_COLORS]);
      expect(ring.width).toBe(RING_WIDTH);
      expect(ring.dashed).toBe(false);
    }
  });

  test.each(AGENT_STATUSES)('agentStatus "%s", provider CANNOT report status — thin dashed neutral ring regardless', (agentStatus) => {
    const ring = agentRingForNode({ agentStatus, providerCanReportStatus: false });
    expect(ring.visible).toBe(true);
    expect(ring.stroke).toBe(CANNOT_REPORT_COLOR);
    expect(ring.width).toBe(RING_WIDTH_THIN);
    expect(ring.dashed).toBe(true);
  });

  test("the ring colour always matches colors.js — never a re-chosen value", () => {
    for (const status of ["working", "idle", "blocked", "stalled"]) {
      const ring = agentRingForNode({ agentStatus: status, providerCanReportStatus: true });
      expect(ring.stroke).toBe(STATUS_COLORS[status as keyof typeof STATUS_COLORS]);
    }
  });

  test("ring width stays within the ticket's 3-4px band for a visible, reporting ring", () => {
    const ring = agentRingForNode({ agentStatus: "working", providerCanReportStatus: true });
    expect(ring.width).toBeGreaterThanOrEqual(3);
    expect(ring.width).toBeLessThanOrEqual(4);
  });

  test("none and cannot-report are NOT drawn the same way, even though colorForNode gives them the same hex", () => {
    const none = agentRingForNode({ agentStatus: "none", providerCanReportStatus: true });
    const cannotReport = agentRingForNode({ agentStatus: "none", providerCanReportStatus: false });
    expect(none.visible).toBe(false);
    expect(cannotReport.visible).toBe(true);
  });

  test("a project node (FACTORY-911) draws NO ring, even though its own providerCanReportStatus/agentStatus would otherwise read as 'cannot report'", () => {
    const projectNode = { provider: "jira-project", resourceType: "project", agentStatus: "none", providerCanReportStatus: false };
    expect(agentRingForNode(projectNode).visible).toBe(false);
  });
});
