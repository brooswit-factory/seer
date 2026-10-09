import { describe, expect, test } from "bun:test";
import {
  JIRA_BORDER_BACKLOG,
  JIRA_BORDER_DARK_HAIRLINE,
  JIRA_BORDER_DONE,
  JIRA_BORDER_IN_PROGRESS,
  JIRA_BORDER_IN_REVIEW,
  JIRA_BORDER_NEUTRAL,
  JIRA_BORDER_TODO,
  JIRA_STATUS_BORDERS,
  jiraBorderForNode,
  jiraBorderHairlineForNode,
  jiraBorderKeyForNode,
  jiraStatusLabel,
} from "../public/jira-status.js";
import { contrastRatio, THEME_TOKENS } from "../public/contrast.js";
import { COLORBLIND_TYPES, rgbDistance, simulateColorblind } from "../public/colorblind.js";
import { PROJECT_FILL } from "../public/project.js";
import { STATUS_COLORS, CANNOT_REPORT_COLOR } from "../public/colors.js";

// FACTORY-944/FACTORY-943: the Jira border palette is recoloured to To Do = black, Backlog =
// grey, In Progress = green, In Review = yellow, Done = blue, replacing FACTORY-939's
// Okabe-Ito-derived blue/muted-blue/vermillion/purple/teal-green set. The stroke-contrast floor
// itself (FACTORY-939: >= 4.5:1 against that theme's canvas, tighter than FACTORY-900's >= 3:1
// fill floor) is UNCHANGED — kept here, not loosened — EXCEPT for dark-theme "To Do", which
// FACTORY-944's own requirement 2 explicitly scopes the floor to "blue/green/yellow" tokens only
// (never black): see the dedicated carve-out test below and public/jira-status.js's header
// comment for why a near-black token cannot itself clear 4.5:1 against a dark canvas.
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

describe("jiraBorderHairlineForNode (FACTORY-944 item 1): dark-theme 'To Do' only", () => {
  const todoNode = { jiraStatus: { name: "To Do", category: "new" } };
  const doneNode = { jiraStatus: { name: "Done", category: "done" } };
  const projectNode = { provider: "jira-project", resourceType: "project" };

  test("dark-theme To Do gets the hairline colour", () => {
    expect(jiraBorderHairlineForNode(todoNode, "dark")).toBe(JIRA_BORDER_DARK_HAIRLINE);
  });

  test("light-theme To Do gets no hairline — the contrast floor already covers it there", () => {
    expect(jiraBorderHairlineForNode(todoNode, "light")).toBeNull();
  });

  test("every other dark-theme status gets no hairline", () => {
    expect(jiraBorderHairlineForNode(doneNode, "dark")).toBeNull();
  });

  test("a project node never gets a hairline, even in dark theme", () => {
    expect(jiraBorderHairlineForNode(projectNode, "dark")).toBeNull();
  });
});

describe("Jira-status border palette: contrast against the canvas (WCAG >= 4.5:1, both themes — FACTORY-939's stroke floor, kept by FACTORY-944)", () => {
  for (const [themeName, borders] of Object.entries(JIRA_STATUS_BORDERS)) {
    const bg = THEME_TOKENS[themeName as "light" | "dark"].bg;
    describe(`${themeName} theme`, () => {
      for (const [key, hex] of Object.entries(borders)) {
        // Deliberate carve-out (FACTORY-944 requirement 2 scopes the floor to blue/green/yellow
        // tokens only): dark-theme "To Do" is a near-black token that by construction cannot
        // clear 4.5:1 against the dark canvas — it relies on jiraBorderHairlineForNode's hairline
        // instead. Every other cell, including light-theme "To Do" (black reads fine on the light
        // canvas), still holds the floor.
        if (themeName === "dark" && key === JIRA_BORDER_TODO) {
          test(`${key} (${hex}) is exempt from the contrast floor by design — relies on the hairline instead`, () => {
            expect(contrastRatio(hex, bg)).toBeLessThan(MIN_BORDER_CONTRAST);
            expect(contrastRatio(JIRA_BORDER_DARK_HAIRLINE, bg)).toBeGreaterThanOrEqual(MIN_BORDER_CONTRAST);
          });
          continue;
        }
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

describe("border-vs-fill adjacency (FACTORY-939 item 3, extended by FACTORY-944 for the new green-on-green / yellow-on-yellow pairs): the Jira border must stay colour-blind-distinguishable from every agent-fill colour it can sit directly against", () => {
  for (const [themeName, borderTable] of Object.entries(JIRA_STATUS_BORDERS)) {
    const borders: Record<string, string> = borderTable;
    const theme = themeName as "light" | "dark";
    const AGENT_FILLS: Record<string, string> = { ...STATUS_COLORS[theme], cannotReport: CANNOT_REPORT_COLOR[theme] };

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

      // FACTORY-944's two deliberately-overlapping-hue pairs, named explicitly (not just covered
      // incidentally by the loop above) so a future hex change that collapses either one back
      // together fails here with a pointed message, not just a generic "some pair failed".
      test("In Progress border (green) vs Working fill (green) stays distinguishable, every vision type", () => {
        const borderHex = borders[JIRA_BORDER_IN_PROGRESS]!;
        const fillHex = AGENT_FILLS.working!;
        expect(rgbDistance(hexToRgb(borderHex), hexToRgb(fillHex))).toBeGreaterThanOrEqual(MIN_COLORBLIND_DISTANCE);
        for (const type of COLORBLIND_TYPES) {
          expect(rgbDistance(simulateColorblind(borderHex, type), simulateColorblind(fillHex, type))).toBeGreaterThanOrEqual(MIN_COLORBLIND_DISTANCE);
        }
      });

      test("In Review border (yellow) vs Idle fill (yellow) stays distinguishable, every vision type", () => {
        const borderHex = borders[JIRA_BORDER_IN_REVIEW]!;
        const fillHex = AGENT_FILLS.idle!;
        expect(rgbDistance(hexToRgb(borderHex), hexToRgb(fillHex))).toBeGreaterThanOrEqual(MIN_COLORBLIND_DISTANCE);
        for (const type of COLORBLIND_TYPES) {
          expect(rgbDistance(simulateColorblind(borderHex, type), simulateColorblind(fillHex, type))).toBeGreaterThanOrEqual(MIN_COLORBLIND_DISTANCE);
        }
      });
    });
  }
});

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace(/^#/, "");
  return [parseInt(normalized.slice(0, 2), 16), parseInt(normalized.slice(2, 4), 16), parseInt(normalized.slice(4, 6), 16)];
}
