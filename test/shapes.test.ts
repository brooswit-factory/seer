import { describe, expect, test } from "bun:test";
import {
  JIRA_RESOURCE_TYPE_SHAPES,
  SHAPE_ROUNDED_SQUARE,
  SHAPE_STAR,
  shapeForNode,
  sizeForNode,
} from "../public/shapes.js";

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
