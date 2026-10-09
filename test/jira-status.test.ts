import { describe, expect, test } from "bun:test";
import {
  JIRA_BORDER_BACKLOG,
  JIRA_BORDER_DONE,
  JIRA_BORDER_IN_PROGRESS,
  JIRA_BORDER_IN_REVIEW,
  JIRA_BORDER_NEUTRAL,
  JIRA_BORDER_TODO,
  JIRA_STATUS_BORDERS,
  jiraBorderForNode,
  jiraBorderKeyForNode,
  jiraStatusLabel,
} from "../public/jira-status.js";
import { contrastRatio, THEME_TOKENS } from "../public/contrast.js";
import { COLORBLIND_TYPES, rgbDistance, simulateColorblind } from "../public/colorblind.js";
import { PROJECT_FILL } from "../public/project.js";
import { STATUS_COLORS, CANNOT_REPORT_COLOR } from "../public/colors.js";

// FACTORY-939: the Jira palette is a thin 3-4px STROKE now (border), not a filled area, so it
// holds the same >= 4.5:1 stroke-contrast floor `--node-stroke`/`--edge`/`--arrowhead` already do
// — tighter than FACTORY-900's >= 3:1 fill floor.
const MIN_BORDER_CONTRAST = 4.5;
const MIN_COLORBLIND_DISTANCE = 30; // a conservative floor under the worst-case simulated pair across both themes (see FACTORY-900 palette-selection notes, carried over).

const FIVE_STATUS_KEYS = [JIRA_BORDER_TODO, JIRA_BORDER_BACKLOG, JIRA_BORDER_IN_PROGRESS, JIRA_BORDER_IN_REVIEW, JIRA_BORDER_DONE];

describe("jiraBorderKeyForNode: table-driven over every status, including custom/unknown/non-Jira", () => {
  test.each([
    ["To Do", "new", JIRA_BORDER_TODO],
    ["to do", "new", JIRA_BORDER_TODO], // case-insensitive
    ["Backlog", "new", JIRA_BORDER_BACKLOG],
    ["In Progress", "indeterminate", JIRA_BORDER_IN_PROGRESS],
    ["In Review", "indeterminate", JIRA_BORDER_IN_REVIEW],
    ["Done", "done", JIRA_BORDER_DONE],
  ])("exact status name %s -> %s", (name, category, expected) => {
    expect(jiraBorderKeyForNode({ jiraStatus: { name, category } })).toBe(expected);
  });

  test.each([
    ["Custom New Thing", "new", JIRA_BORDER_TODO],
    ["Custom Doing Thing", "indeterminate", JIRA_BORDER_IN_PROGRESS],
    ["Custom Finished Thing", "done", JIRA_BORDER_DONE],
  ])("unrecognized custom status %s falls back by its statusCategory (%s) -> %s", (name, category, expected) => {
    expect(jiraBorderKeyForNode({ jiraStatus: { name, category } })).toBe(expected);
  });

  test("a node with no jiraStatus at all (non-Jira provider) is neutral", () => {
    expect(jiraBorderKeyForNode({ provider: "github" })).toBe(JIRA_BORDER_NEUTRAL);
    expect(jiraBorderKeyForNode({})).toBe(JIRA_BORDER_NEUTRAL);
    expect(jiraBorderKeyForNode(undefined)).toBe(JIRA_BORDER_NEUTRAL);
  });
});

describe("jiraBorderForNode / jiraStatusLabel", () => {
  test("returns the actual theme hex, not just the key", () => {
    const node = { jiraStatus: { name: "Done", category: "done" } };
    expect(jiraBorderForNode(node, "light")).toBe(JIRA_STATUS_BORDERS.light[JIRA_BORDER_DONE]);
    expect(jiraBorderForNode(node, "dark")).toBe(JIRA_STATUS_BORDERS.dark[JIRA_BORDER_DONE]);
    expect(jiraBorderForNode(node, "light")).not.toBe(jiraBorderForNode(node, "dark"));
  });

  test("statusLabel reports the real Jira status name, or an explicit absence", () => {
    expect(jiraStatusLabel({ jiraStatus: { name: "In Review", category: "indeterminate" } })).toBe("In Review");
    expect(jiraStatusLabel({})).toBe("no Jira status");
  });

  test("a project node (FACTORY-911) always gets its own fixed PROJECT_FILL, never a Jira-status colour — even if jiraStatus were somehow present", () => {
    const projectNode = { provider: "jira-project", resourceType: "project", jiraStatus: { name: "Done", category: "done" } };
    expect(jiraBorderForNode(projectNode, "light")).toBe(PROJECT_FILL.light);
    expect(jiraBorderForNode(projectNode, "dark")).toBe(PROJECT_FILL.dark);
    expect(jiraBorderForNode(projectNode, "light")).not.toBe(JIRA_STATUS_BORDERS.light[JIRA_BORDER_DONE]);
  });
});

describe("Jira-status border palette: contrast against the canvas (WCAG >= 4.5:1, both themes — FACTORY-939's stroke floor)", () => {
  for (const [themeName, borders] of Object.entries(JIRA_STATUS_BORDERS)) {
    const bg = THEME_TOKENS[themeName as "light" | "dark"].bg;
    describe(`${themeName} theme`, () => {
      for (const [key, hex] of Object.entries(borders)) {
        test(`${key} (${hex}) vs background (${bg})`, () => {
          expect(contrastRatio(hex, bg)).toBeGreaterThanOrEqual(MIN_BORDER_CONTRAST);
        });
      }
    });
  }
});

describe("Jira-status border palette: colour-blind-safe pairwise distance (protanopia/deuteranopia/tritanopia)", () => {
  for (const [themeName, borderTable] of Object.entries(JIRA_STATUS_BORDERS)) {
    const borders: Record<string, string> = borderTable;
    describe(`${themeName} theme`, () => {
      const pairs: Array<[string, string]> = [];
      for (let i = 0; i < FIVE_STATUS_KEYS.length; i++) {
        for (let j = i + 1; j < FIVE_STATUS_KEYS.length; j++) {
          pairs.push([FIVE_STATUS_KEYS[i]!, FIVE_STATUS_KEYS[j]!]);
        }
      }

      test("normal vision: every pair of the five borders is visually distinct", () => {
        for (const [a, b] of pairs) {
          const distance = rgbDistance(hexToRgb(borders[a]!), hexToRgb(borders[b]!));
          expect(distance).toBeGreaterThan(0);
        }
      });

      for (const type of COLORBLIND_TYPES) {
        test(`${type}: every pair of the five borders stays >= ${MIN_COLORBLIND_DISTANCE} apart`, () => {
          for (const [a, b] of pairs) {
            const distance = rgbDistance(simulateColorblind(borders[a]!, type), simulateColorblind(borders[b]!, type));
            expect(distance).toBeGreaterThanOrEqual(MIN_COLORBLIND_DISTANCE);
          }
        });
      }

      test("sanity: the distance check can actually fail (a colour against itself is zero)", () => {
        expect(rgbDistance(hexToRgb(borders[JIRA_BORDER_TODO]!), hexToRgb(borders[JIRA_BORDER_TODO]!))).toBe(0);
      });
    });
  }
});

describe("border-vs-fill adjacency (FACTORY-939 item 3): the Jira border must stay colour-blind-distinguishable from every agent-fill colour it can sit directly against", () => {
  const AGENT_FILLS: Record<string, string> = { ...STATUS_COLORS, cannotReport: CANNOT_REPORT_COLOR };

  for (const [themeName, borderTable] of Object.entries(JIRA_STATUS_BORDERS)) {
    const borders: Record<string, string> = borderTable;
    describe(`${themeName} theme`, () => {
      for (const [borderKey, borderHex] of Object.entries(borders)) {
        for (const [agentKey, agentHex] of Object.entries(AGENT_FILLS)) {
          test(`border ${borderKey} (${borderHex}) vs agent fill ${agentKey} (${agentHex}) stays >= ${MIN_COLORBLIND_DISTANCE} apart, every vision type`, () => {
            expect(rgbDistance(hexToRgb(borderHex), hexToRgb(agentHex))).toBeGreaterThanOrEqual(MIN_COLORBLIND_DISTANCE);
            for (const type of COLORBLIND_TYPES) {
              const distance = rgbDistance(simulateColorblind(borderHex, type), simulateColorblind(agentHex, type));
              expect(distance).toBeGreaterThanOrEqual(MIN_COLORBLIND_DISTANCE);
            }
          });
        }
      }
    });
  }
});

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace(/^#/, "");
  return [parseInt(normalized.slice(0, 2), 16), parseInt(normalized.slice(2, 4), 16), parseInt(normalized.slice(4, 6), 16)];
}
