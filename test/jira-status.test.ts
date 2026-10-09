import { describe, expect, test } from "bun:test";
import {
  JIRA_FILL_BACKLOG,
  JIRA_FILL_DONE,
  JIRA_FILL_IN_PROGRESS,
  JIRA_FILL_IN_REVIEW,
  JIRA_FILL_NEUTRAL,
  JIRA_FILL_TODO,
  JIRA_STATUS_FILLS,
  jiraFillForNode,
  jiraFillKeyForNode,
  jiraStatusLabel,
} from "../public/jira-status.js";
import { contrastRatio, THEME_TOKENS } from "../public/contrast.js";
import { COLORBLIND_TYPES, rgbDistance, simulateColorblind } from "../public/colorblind.js";

const MIN_FILL_CONTRAST = 3; // the ticket's own threshold (item 2) — looser than the 4.5:1 text/stroke rule, appropriate for a filled shape.
const MIN_COLORBLIND_DISTANCE = 30; // a conservative floor under the worst-case simulated pair across both themes (see FACTORY-900 palette-selection notes).

const FIVE_STATUS_KEYS = [JIRA_FILL_TODO, JIRA_FILL_BACKLOG, JIRA_FILL_IN_PROGRESS, JIRA_FILL_IN_REVIEW, JIRA_FILL_DONE];

describe("jiraFillKeyForNode: table-driven over every status, including custom/unknown/non-Jira", () => {
  test.each([
    ["To Do", "new", JIRA_FILL_TODO],
    ["to do", "new", JIRA_FILL_TODO], // case-insensitive
    ["Backlog", "new", JIRA_FILL_BACKLOG],
    ["In Progress", "indeterminate", JIRA_FILL_IN_PROGRESS],
    ["In Review", "indeterminate", JIRA_FILL_IN_REVIEW],
    ["Done", "done", JIRA_FILL_DONE],
  ])("exact status name %s -> %s", (name, category, expected) => {
    expect(jiraFillKeyForNode({ jiraStatus: { name, category } })).toBe(expected);
  });

  test.each([
    ["Custom New Thing", "new", JIRA_FILL_TODO],
    ["Custom Doing Thing", "indeterminate", JIRA_FILL_IN_PROGRESS],
    ["Custom Finished Thing", "done", JIRA_FILL_DONE],
  ])("unrecognized custom status %s falls back by its statusCategory (%s) -> %s", (name, category, expected) => {
    expect(jiraFillKeyForNode({ jiraStatus: { name, category } })).toBe(expected);
  });

  test("a node with no jiraStatus at all (non-Jira provider) is neutral", () => {
    expect(jiraFillKeyForNode({ provider: "github" })).toBe(JIRA_FILL_NEUTRAL);
    expect(jiraFillKeyForNode({})).toBe(JIRA_FILL_NEUTRAL);
    expect(jiraFillKeyForNode(undefined)).toBe(JIRA_FILL_NEUTRAL);
  });
});

describe("jiraFillForNode / jiraStatusLabel", () => {
  test("returns the actual theme hex, not just the key", () => {
    const node = { jiraStatus: { name: "Done", category: "done" } };
    expect(jiraFillForNode(node, "light")).toBe(JIRA_STATUS_FILLS.light[JIRA_FILL_DONE]);
    expect(jiraFillForNode(node, "dark")).toBe(JIRA_STATUS_FILLS.dark[JIRA_FILL_DONE]);
    expect(jiraFillForNode(node, "light")).not.toBe(jiraFillForNode(node, "dark"));
  });

  test("statusLabel reports the real Jira status name, or an explicit absence", () => {
    expect(jiraStatusLabel({ jiraStatus: { name: "In Review", category: "indeterminate" } })).toBe("In Review");
    expect(jiraStatusLabel({})).toBe("no Jira status");
  });
});

describe("Jira-status fill palette: contrast against the canvas (WCAG >= 3:1, both themes)", () => {
  for (const [themeName, fills] of Object.entries(JIRA_STATUS_FILLS)) {
    const bg = THEME_TOKENS[themeName as "light" | "dark"].bg;
    describe(`${themeName} theme`, () => {
      for (const [key, hex] of Object.entries(fills)) {
        test(`${key} (${hex}) vs background (${bg})`, () => {
          expect(contrastRatio(hex, bg)).toBeGreaterThanOrEqual(MIN_FILL_CONTRAST);
        });
      }
    });
  }
});

describe("Jira-status fill palette: colour-blind-safe pairwise distance (protanopia/deuteranopia/tritanopia)", () => {
  for (const [themeName, fillTable] of Object.entries(JIRA_STATUS_FILLS)) {
    const fills: Record<string, string> = fillTable;
    describe(`${themeName} theme`, () => {
      const pairs: Array<[string, string]> = [];
      for (let i = 0; i < FIVE_STATUS_KEYS.length; i++) {
        for (let j = i + 1; j < FIVE_STATUS_KEYS.length; j++) {
          pairs.push([FIVE_STATUS_KEYS[i]!, FIVE_STATUS_KEYS[j]!]);
        }
      }

      test("normal vision: every pair of the five fills is visually distinct", () => {
        for (const [a, b] of pairs) {
          const distance = rgbDistance(hexToRgb(fills[a]!), hexToRgb(fills[b]!));
          expect(distance).toBeGreaterThan(0);
        }
      });

      for (const type of COLORBLIND_TYPES) {
        test(`${type}: every pair of the five fills stays >= ${MIN_COLORBLIND_DISTANCE} apart`, () => {
          for (const [a, b] of pairs) {
            const distance = rgbDistance(simulateColorblind(fills[a]!, type), simulateColorblind(fills[b]!, type));
            expect(distance).toBeGreaterThanOrEqual(MIN_COLORBLIND_DISTANCE);
          }
        });
      }

      test("sanity: the distance check can actually fail (a colour against itself is zero)", () => {
        expect(rgbDistance(hexToRgb(fills[JIRA_FILL_TODO]!), hexToRgb(fills[JIRA_FILL_TODO]!))).toBe(0);
      });
    });
  }
});

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace(/^#/, "");
  return [parseInt(normalized.slice(0, 2), 16), parseInt(normalized.slice(2, 4), 16), parseInt(normalized.slice(4, 6), 16)];
}
