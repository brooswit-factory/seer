import { describe, expect, test } from "bun:test";
import { isProjectNode, projectFill, PROJECT_FILL, PROJECT_PROVIDER, PROJECT_SIZE, PROJECT_LINK_DISTANCE } from "../public/project.js";
import { contrastRatio, THEME_TOKENS } from "../public/contrast.js";

const MIN_FILL_CONTRAST = 3; // same floor jira-status.test.ts holds its fills to (the ticket's own item-3 threshold for a filled shape).

describe("isProjectNode", () => {
  test("true for a node with provider jira-project", () => {
    expect(isProjectNode({ provider: PROJECT_PROVIDER, resourceType: "project" })).toBe(true);
  });

  test("false for an ordinary Jira ticket, even an Epic", () => {
    expect(isProjectNode({ provider: "jira-work", resourceType: "Epic" })).toBe(false);
  });

  test("false for a non-Jira node whose resourceType happens to be the string 'project'", () => {
    // resourceType alone must never be sufficient — only the collector's own fixed provider key is trusted.
    expect(isProjectNode({ provider: "github", resourceType: "project" })).toBe(false);
  });

  test("never throws on a missing/malformed node", () => {
    expect(isProjectNode(undefined)).toBe(false);
    expect(isProjectNode({})).toBe(false);
  });
});

describe("projectFill: fixed colour token, both themes, >= 3:1 vs canvas", () => {
  test("returns a distinct hex per theme", () => {
    expect(projectFill("light")).toBe(PROJECT_FILL.light);
    expect(projectFill("dark")).toBe(PROJECT_FILL.dark);
    expect(projectFill("light")).not.toBe(projectFill("dark"));
  });

  test("falls back to light for an unrecognized theme name", () => {
    expect(projectFill("sepia")).toBe(PROJECT_FILL.light);
  });

  for (const [theme, hex] of Object.entries(PROJECT_FILL)) {
    test(`${theme} PROJECT_FILL (${hex}) vs its own --bg clears the >= 3:1 floor`, () => {
      const bg = THEME_TOKENS[theme as "light" | "dark"].bg;
      expect(contrastRatio(hex, bg)).toBeGreaterThanOrEqual(MIN_FILL_CONTRAST);
    });
  }
});

describe("PROJECT_SIZE / PROJECT_LINK_DISTANCE", () => {
  test("both are positive, finite config constants", () => {
    expect(PROJECT_SIZE).toBeGreaterThan(0);
    expect(PROJECT_LINK_DISTANCE).toBeGreaterThan(0);
    expect(Number.isFinite(PROJECT_SIZE)).toBe(true);
    expect(Number.isFinite(PROJECT_LINK_DISTANCE)).toBe(true);
  });
});
