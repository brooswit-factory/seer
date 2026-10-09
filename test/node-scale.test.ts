import { describe, expect, test } from "bun:test";
import { JIRA_RESOURCE_TYPE_SHAPES, sizeForNode } from "../public/shapes.js";
import { isLiveAgentNode, scaledSizeForNode, sizeMultiplierForNode } from "../public/node-scale.js";
import { PROJECT_SIZE } from "../public/project.js";

const SIZE_CONFIG = { base: 1.5, active: 2 };

const RESOURCE_TYPES = [...Object.keys(JIRA_RESOURCE_TYPE_SHAPES), undefined /* other/unknown */];
const AGENT_STATUSES = ["working", "idle", "blocked", "stalled", "none"];

function node(resourceType: string | undefined, agentStatus: string, providerCanReportStatus = true) {
  return { provider: "jira-work", resourceType, agentStatus, providerCanReportStatus };
}

describe("isLiveAgentNode", () => {
  test.each(["working", "idle", "blocked", "stalled"])("agentStatus %s with a reporting provider IS live", (status) => {
    expect(isLiveAgentNode(node("Task", status))).toBe(true);
  });

  test('agentStatus "none" (covers butchr\'s "shelved") is NOT live', () => {
    expect(isLiveAgentNode(node("Task", "none"))).toBe(false);
  });

  test.each(["working", "idle", "blocked", "stalled"])(
    "agentStatus %s is NOT live when the provider cannot report status at all",
    (status) => {
      expect(isLiveAgentNode(node("Task", status, false))).toBe(false);
    },
  );

  test("a node with no provider (non-Jira, no agent) is not live", () => {
    expect(isLiveAgentNode({ provider: "github", agentStatus: "none", providerCanReportStatus: false })).toBe(false);
  });
});

describe("sizeMultiplierForNode / scaledSizeForNode: table-driven over every status x type", () => {
  for (const resourceType of RESOURCE_TYPES) {
    for (const agentStatus of AGENT_STATUSES) {
      const live = ["working", "idle", "blocked", "stalled"].includes(agentStatus);
      const label = `${resourceType ?? "other/unknown"} x ${agentStatus}`;

      test(`${label}: multiplier is ${live ? "active (2x)" : "base (1.5x)"}, never stacked`, () => {
        const n = node(resourceType, agentStatus);
        const expectedMultiplier = live ? SIZE_CONFIG.active : SIZE_CONFIG.base;
        expect(sizeMultiplierForNode(n, SIZE_CONFIG)).toBe(expectedMultiplier);

        // Linear multiplier -> area scales by its square (sizeForNode/d3.symbol.size are area units).
        const expectedArea = sizeForNode(n) * expectedMultiplier * expectedMultiplier;
        expect(scaledSizeForNode(n, SIZE_CONFIG)).toBe(expectedArea);

        // "active" replaces "base" — it is never base stacked with active.
        if (live) {
          expect(scaledSizeForNode(n, SIZE_CONFIG)).not.toBe(sizeForNode(n) * SIZE_CONFIG.base * SIZE_CONFIG.active);
        }
      });
    }
  }

  test("a project node (FACTORY-911) is NEVER scaled by SEER_SIZE_BASE/ACTIVE — scaledSizeForNode returns its fixed PROJECT_SIZE regardless of agentStatus", () => {
    for (const agentStatus of AGENT_STATUSES) {
      for (const providerCanReportStatus of [true, false]) {
        const projectNode = { provider: "jira-project", resourceType: "project", agentStatus, providerCanReportStatus };
        expect(scaledSizeForNode(projectNode, SIZE_CONFIG)).toBe(PROJECT_SIZE);
        // Also true against a config whose multipliers would otherwise obviously change the area.
        expect(scaledSizeForNode(projectNode, { base: 10, active: 20 })).toBe(PROJECT_SIZE);
      }
    }
  });

  test("every scaled size is a positive, finite number", () => {
    for (const resourceType of RESOURCE_TYPES) {
      for (const agentStatus of AGENT_STATUSES) {
        const size = scaledSizeForNode(node(resourceType, agentStatus), SIZE_CONFIG);
        expect(Number.isFinite(size)).toBe(true);
        expect(size).toBeGreaterThan(0);
      }
    }
  });
});
