import { describe, expect, test } from "bun:test";
import {
  BORDER_WIDTH,
  JIRA_RESOURCE_TYPE_SHAPES,
  SHAPE_ROUNDED_SQUARE,
  SHAPE_STAR,
  borderForNode,
  shapeForNode,
  sizeForNode,
} from "../public/shapes.js";
import { SHAPE_PROJECT, PROJECT_SIZE } from "../public/project.js";
import { jiraBorderForNode } from "../public/jira-status.js";

describe("shapeForNode", () => {
  test.each(Object.entries(JIRA_RESOURCE_TYPE_SHAPES))("Jira resourceType %s maps to shape %s", (resourceType, expectedShape) => {
    expect(shapeForNode({ provider: "jira-work", resourceType })).toBe(expectedShape);
  });

  test("every known Jira type maps to a DISTINCT shape — no two collide", () => {
    const shapes = Object.values(JIRA_RESOURCE_TYPE_SHAPES);
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  test("an unrecognized Jira issue type falls through to other/unknown (rounded square)", () => {
    expect(shapeForNode({ provider: "jira-work", resourceType: "Improvement" })).toBe(SHAPE_ROUNDED_SQUARE);
  });

  test("a Jira node with resourceType absent falls through to other/unknown", () => {
    expect(shapeForNode({ provider: "jira-work" })).toBe(SHAPE_ROUNDED_SQUARE);
  });

  test("every non-Jira provider gets the shared non-Jira shape, distinct from every Jira shape", () => {
    expect(shapeForNode({ provider: "github", resourceType: "pull-request" })).toBe(SHAPE_STAR);
    expect(shapeForNode({ provider: "confluence", resourceType: "confluence-page" })).toBe(SHAPE_STAR);
    expect(shapeForNode({ provider: "github" })).toBe(SHAPE_STAR);
    expect(Object.values(JIRA_RESOURCE_TYPE_SHAPES)).not.toContain(SHAPE_STAR);
    expect(SHAPE_STAR).not.toBe(SHAPE_ROUNDED_SQUARE);
  });

  test("the other/unknown shape is distinct from every known Jira shape", () => {
    expect(Object.values(JIRA_RESOURCE_TYPE_SHAPES)).not.toContain(SHAPE_ROUNDED_SQUARE);
  });

  test("a project node (FACTORY-911) gets its own distinct shape, never a type shape", () => {
    const node = { provider: "jira-project", resourceType: "project" };
    expect(shapeForNode(node)).toBe(SHAPE_PROJECT);
    expect(Object.values(JIRA_RESOURCE_TYPE_SHAPES)).not.toContain(SHAPE_PROJECT);
    expect(SHAPE_PROJECT).not.toBe(SHAPE_STAR);
    expect(SHAPE_PROJECT).not.toBe(SHAPE_ROUNDED_SQUARE);
  });

  test("a project node is detected by its provider, not merely its resourceType string", () => {
    // provider "jira-project" starts with "jira" (isJiraProvider's own prefix test) — the project
    // check must win BEFORE that fallthrough, or this would wrongly land on roundedSquare.
    expect(shapeForNode({ provider: "jira-project", resourceType: "project" })).not.toBe(SHAPE_ROUNDED_SQUARE);
  });
});

describe("sizeForNode for a project node", () => {
  test("is the fixed PROJECT_SIZE, not derived from any type tier", () => {
    const node = { provider: "jira-project", resourceType: "project" };
    expect(sizeForNode(node)).toBe(PROJECT_SIZE);
  });

  test("PROJECT_SIZE is larger than every ticket shape's size, so a project always reads as the biggest node", () => {
    const ticketSizes = Object.keys(JIRA_RESOURCE_TYPE_SHAPES).map((resourceType) =>
      sizeForNode({ provider: "jira-work", resourceType }),
    );
    expect(PROJECT_SIZE).toBeGreaterThan(Math.max(...ticketSizes));
  });
});

describe("sizeForNode", () => {
  test("Epic (hexagon) is the largest tier; Sub-task (diamond) is the smallest", () => {
    const epicSize = sizeForNode({ provider: "jira-work", resourceType: "Epic" });
    const subtaskSize = sizeForNode({ provider: "jira-work", resourceType: "Sub-task" });
    const allSizes = Object.keys(JIRA_RESOURCE_TYPE_SHAPES).map((resourceType) =>
      sizeForNode({ provider: "jira-work", resourceType }),
    );
    expect(epicSize).toBe(Math.max(...allSizes));
    expect(subtaskSize).toBe(Math.min(...allSizes));
  });

  test("every shape has a defined, positive size", () => {
    const nodes = [
      { provider: "jira-work", resourceType: "Epic" },
      { provider: "jira-work", resourceType: "Story" },
      { provider: "jira-work", resourceType: "Task" },
      { provider: "jira-work", resourceType: "Bug" },
      { provider: "jira-work", resourceType: "Sub-task" },
      { provider: "jira-work" },
      { provider: "github" },
    ];
    for (const node of nodes) {
      expect(sizeForNode(node)).toBeGreaterThan(0);
    }
  });
});

const JIRA_STATUSES: Array<[string, string]> = [
  ["To Do", "new"],
  ["Backlog", "new"],
  ["In Progress", "indeterminate"],
  ["In Review", "indeterminate"],
  ["Done", "done"],
  ["Some Custom Status", "indeterminate"], // non-Jira/unrecognized -> falls back by category
];

describe("borderForNode: table-driven over every Jira status incl. custom/non-Jira (FACTORY-939)", () => {
  test.each(JIRA_STATUSES)('jiraStatus "%s" (%s), reporting provider', (name, category) => {
    const node = { jiraStatus: { name, category }, providerCanReportStatus: true };
    const border = borderForNode(node, "light");
    expect(border.visible).toBe(true);
    expect(border.stroke).toBe(jiraBorderForNode(node, "light"));
    expect(border.width).toBe(BORDER_WIDTH);
    expect(border.dashed).toBe(false);
  });

  test("a non-Jira node (no jiraStatus at all) still draws a border, coloured neutral", () => {
    const node = { provider: "github", providerCanReportStatus: true };
    const border = borderForNode(node, "light");
    expect(border.visible).toBe(true);
    expect(border.stroke).toBe(jiraBorderForNode(node, "light"));
  });

  test.each(JIRA_STATUSES)('jiraStatus "%s" (%s), provider CANNOT report agent status — dashed border regardless of Jira status', (name, category) => {
    const node = { jiraStatus: { name, category }, providerCanReportStatus: false };
    const border = borderForNode(node, "light");
    expect(border.visible).toBe(true);
    expect(border.dashed).toBe(true);
    // The dash is about agent reporting, not Jira status — the colour still follows jiraStatus.
    expect(border.stroke).toBe(jiraBorderForNode(node, "light"));
    expect(border.width).toBe(BORDER_WIDTH);
  });

  test("the border colour always matches jira-status.js — never a re-chosen value", () => {
    for (const [name, category] of JIRA_STATUSES) {
      const node = { jiraStatus: { name, category }, providerCanReportStatus: true };
      expect(borderForNode(node, "dark").stroke).toBe(jiraBorderForNode(node, "dark"));
    }
  });

  test("border width stays within the ticket's 3-4px band", () => {
    const border = borderForNode({ providerCanReportStatus: true }, "light");
    expect(border.width).toBeGreaterThanOrEqual(3);
    expect(border.width).toBeLessThanOrEqual(4);
  });

  test("a project node (FACTORY-911) draws NO border, even though it would otherwise fall back to the neutral Jira colour", () => {
    const projectNode = { provider: "jira-project", resourceType: "project", providerCanReportStatus: false };
    expect(borderForNode(projectNode, "light").visible).toBe(false);
  });
});
