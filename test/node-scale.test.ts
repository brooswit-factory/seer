import { describe, expect, test } from "bun:test";
import { JIRA_RESOURCE_TYPE_SHAPES, sizeForNode } from "../public/shapes.js";
import { scaledSizeForNode, sizeMultiplierForNode } from "../public/node-scale.js";

const SIZE_CONFIG = { epic: 3, bug: 3, story: 2, base: 1.5 };

const JIRA_RESOURCE_TYPES = [...Object.keys(JIRA_RESOURCE_TYPE_SHAPES), undefined /* other/unknown Jira type */];

function node(resourceType: string | undefined, provider = "jira-work") {
  return { provider, resourceType };
}

/** Expected multiplier for a Jira node of a given resourceType, per the FACTORY-913 table. */
function expectedJiraMultiplier(resourceType: string | undefined): number {
  if (resourceType === "Epic") return SIZE_CONFIG.epic;
  if (resourceType === "Bug") return SIZE_CONFIG.bug;
  if (resourceType === "Story") return SIZE_CONFIG.story;
  return SIZE_CONFIG.base; // Task, Sub-task, other/unknown Jira type
}

describe("sizeMultiplierForNode / scaledSizeForNode: table-driven over every Jira resourceType", () => {
  for (const resourceType of JIRA_RESOURCE_TYPES) {
    const expectedMultiplier = expectedJiraMultiplier(resourceType);
    const label = resourceType ?? "other/unknown Jira type";

    test(`${label}: multiplier is ${expectedMultiplier}x`, () => {
      const n = node(resourceType);
      expect(sizeMultiplierForNode(n, SIZE_CONFIG)).toBe(expectedMultiplier);

      // Linear multiplier -> area scales by its square (sizeForNode/d3.symbol.size are area units).
      const expectedArea = sizeForNode(n) * expectedMultiplier * expectedMultiplier;
      expect(scaledSizeForNode(n, SIZE_CONFIG)).toBe(expectedArea);
    });
  }
});

describe("sizeMultiplierForNode: non-Jira providers always get base, regardless of resourceType", () => {
  test.each(["Epic", "Bug", "Story", "pull-request", undefined])(
    "non-Jira node with resourceType=%s is base (%sx)",
    (resourceType) => {
      const n = node(resourceType, "github");
      expect(sizeMultiplierForNode(n, SIZE_CONFIG)).toBe(SIZE_CONFIG.base);
    },
  );
});

describe("sizeMultiplierForNode: no live-agent branch left", () => {
  test("agentStatus/providerCanReportStatus have no effect on the multiplier", () => {
    const base = { provider: "jira-work", resourceType: "Task" };
    const asWorking = { ...base, agentStatus: "working", providerCanReportStatus: true };
    const asNone = { ...base, agentStatus: "none", providerCanReportStatus: true };
    expect(sizeMultiplierForNode(asWorking, SIZE_CONFIG)).toBe(SIZE_CONFIG.base);
    expect(sizeMultiplierForNode(asNone, SIZE_CONFIG)).toBe(SIZE_CONFIG.base);
  });
});

describe("every scaled size is a positive, finite number", () => {
  test.each([...JIRA_RESOURCE_TYPES, "pull-request"])("resourceType=%s", (resourceType) => {
    const size = scaledSizeForNode(node(resourceType), SIZE_CONFIG);
    expect(Number.isFinite(size)).toBe(true);
    expect(size).toBeGreaterThan(0);
  });
});
