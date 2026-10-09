import { describe, expect, test } from "bun:test";
import {
  CHARS_PER_RADIUS_PX,
  LINE1_GAP_PX,
  LINE2_DESCENDER_PX,
  LINE2_FONT_SCALE,
  LINE_SPACING_PX,
  MIN_LABEL_CHARS,
  labelBottomExtent,
  line1Dy,
  maxCharsForRadius,
  splitNodeLabel,
  truncateToChars,
} from "../public/node-label.js";
import { contrastRatio, MIN_CONTRAST } from "../public/contrast.js";
import { readFileSync } from "node:fs";

describe("splitNodeLabel", () => {
  test("Jira issue: key from id, name is the summary with the key prefix stripped", () => {
    expect(splitNodeLabel({ id: "jira-work:FACTORY-946", label: "FACTORY-946: Some summary text" })).toEqual({
      key: "FACTORY-946",
      name: "Some summary text",
    });
  });

  test("project node: key from id, name is the project name with the key prefix stripped", () => {
    expect(splitNodeLabel({ id: "jira-project:FACTORY", label: "FACTORY factory" })).toEqual({
      key: "FACTORY",
      name: "factory",
    });
  });

  test("non-Jira provider node with no colon in its id: the whole id is the key", () => {
    expect(splitNodeLabel({ id: "slack-general", label: "slack-general: #general channel" })).toEqual({
      key: "slack-general",
      name: "#general channel",
    });
  });

  test("a long name is returned in full (untruncated) — truncation is a separate concern", () => {
    const longName = "A".repeat(200);
    expect(splitNodeLabel({ id: "jira-work:FACTORY-1", label: `FACTORY-1: ${longName}` })).toEqual({
      key: "FACTORY-1",
      name: longName,
    });
  });

  test("an empty name (label is exactly the key) splits to an empty string, not the key again", () => {
    expect(splitNodeLabel({ id: "jira-work:FACTORY-1", label: "FACTORY-1" })).toEqual({
      key: "FACTORY-1",
      name: "",
    });
  });

  test("a name that itself contains the key substring (not as a prefix) is left untouched", () => {
    expect(
      splitNodeLabel({
        id: "jira-work:FACTORY-946",
        label: "FACTORY-946: revisiting FACTORY-946 again",
      }),
    ).toEqual({
      key: "FACTORY-946",
      name: "revisiting FACTORY-946 again",
    });
  });

  test("never throws on a missing/malformed node", () => {
    expect(splitNodeLabel({})).toEqual({ key: "", name: "" });
    expect(splitNodeLabel(undefined)).toEqual({ key: "", name: "" });
  });
});

describe("maxCharsForRadius / truncateToChars", () => {
  test("larger radius yields a larger character budget", () => {
    expect(maxCharsForRadius(20)).toBeGreaterThan(maxCharsForRadius(7));
  });

  test("never drops below the MIN_LABEL_CHARS floor, even for a tiny/zero radius", () => {
    expect(maxCharsForRadius(0)).toBe(MIN_LABEL_CHARS);
    expect(maxCharsForRadius(0.001)).toBe(MIN_LABEL_CHARS);
  });

  test("line 2's smaller font (LINE2_FONT_SCALE) fits more characters than line 1 at the same radius", () => {
    const radius = 15;
    expect(maxCharsForRadius(radius, LINE2_FONT_SCALE)).toBeGreaterThan(maxCharsForRadius(radius, 1));
  });

  test("matches the hand-computed value for a representative radius", () => {
    const radius = 10;
    expect(maxCharsForRadius(radius)).toBe(Math.max(MIN_LABEL_CHARS, Math.round(radius * CHARS_PER_RADIUS_PX)));
  });

  test.each([
    ["short", 10, "short"],
    ["fiver", 5, "fiver"],
    ["needs truncation", 4, "nee…"],
    ["", 5, ""],
  ])("truncateToChars(%p, %p) -> %p", (text, maxChars, expected) => {
    expect(truncateToChars(text, maxChars)).toBe(expected);
  });

  test("a budget of 1 or less still returns a single ellipsis, never an empty cut mid-string", () => {
    expect(truncateToChars("hello", 1)).toBe("…");
    expect(truncateToChars("hello", 0)).toBe("…");
  });
});

describe("line1Dy / labelBottomExtent: tspan dy offsets and bbox extent", () => {
  test("line 1's dy is the node radius plus the fixed gap — today's single-line placement, unchanged", () => {
    expect(line1Dy(10)).toBe(10 + LINE1_GAP_PX);
  });

  test("the label's bottom extent is always beyond line 1's own baseline (line 2 sits strictly beneath it)", () => {
    for (const radius of [0, 5, 10, 25]) {
      expect(labelBottomExtent(radius)).toBeGreaterThan(line1Dy(radius));
    }
  });

  test("the bottom extent accounts for both the line-spacing gap and the descender allowance", () => {
    const radius = 12;
    expect(labelBottomExtent(radius)).toBe(line1Dy(radius) + LINE_SPACING_PX + LINE2_DESCENDER_PX);
  });

  test("no label text starts inside the node's own shape: line 1's dy always clears the radius by the fixed gap", () => {
    for (const radius of [0, 1, 7.5, 20, 100]) {
      expect(line1Dy(radius) - radius).toBe(LINE1_GAP_PX);
    }
  });
});

describe("--node-label-muted theme token: >= 4.5:1 against --bg in both themes", () => {
  const cssPath = new URL("../public/style.css", import.meta.url).pathname;
  const css = readFileSync(cssPath, "utf-8");

  function extractVar(block: string, name: string): string {
    const match = block.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})`));
    const captured = match?.[1];
    if (!captured) throw new Error(`style.css: variable ${name} not found`);
    return captured;
  }

  const lightBlock = css.match(/:root\s*{([^}]*)}/)?.[1];
  const darkBlock = css.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*{\s*:root\s*{([^}]*)}/)?.[1];
  if (!lightBlock || !darkBlock) throw new Error("style.css: could not find both theme blocks");

  test("light theme", () => {
    const bg = extractVar(lightBlock, "--bg");
    const muted = extractVar(lightBlock, "--node-label-muted");
    expect(contrastRatio(muted, bg)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  test("dark theme", () => {
    const bg = extractVar(darkBlock, "--bg");
    const muted = extractVar(darkBlock, "--node-label-muted");
    expect(contrastRatio(muted, bg)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  test("the two themes' tokens are defined (sanity: not accidentally reading the same block twice)", () => {
    expect(lightBlock).not.toBe(darkBlock);
  });
});

// No DOM/d3 execution harness exists in this repo (see test/viewer.test.ts for the same
// source-text-assertion convention) — this checks app.js's own structure for the two-tspan shape
// the ticket requires, rather than rendering it.
describe("app.js node-label rendering: two tspans, line 2 beneath line 1", () => {
  const appJsPath = new URL("../public/app.js", import.meta.url).pathname;
  const appJs = readFileSync(appJsPath, "utf-8");

  test("the node-label <text> element gets exactly two child tspans, one per line", () => {
    expect(appJs).toMatch(/append\("tspan"\)\.attr\("class",\s*"node-label-key"\)/);
    expect(appJs).toMatch(/append\("tspan"\)\.attr\("class",\s*"node-label-name"\)/);
  });

  test("line 1 (key) is positioned via line1Dy (radius + gap) — today's single-line offset", () => {
    expect(appJs).toMatch(/tspan\.node-label-key["'\)].*\n?\s*\.attr\("dy",\s*line1Dy\(radius\)\)/);
  });

  test("line 2 (name) is positioned LINE_SPACING_PX beneath line 1's baseline, not at an independent offset", () => {
    expect(appJs).toMatch(/tspan\.node-label-name["'\)].*\n?\s*\.attr\("dy",\s*LINE_SPACING_PX\)/);
  });

  test("both lines are truncated per-line, independently, via truncateToChars/maxCharsForRadius", () => {
    expect(appJs).toMatch(/truncateToChars\(key, maxCharsForRadius\(radius\)\)/);
    expect(appJs).toMatch(/truncateToChars\(name, maxCharsForRadius\(radius, LINE2_FONT_SCALE\)\)/);
  });

  test("the fit-to-view bbox uses the label's bottom extent, not just the shape radius (second line's extent is now included)", () => {
    expect(appJs).toMatch(/labelBottomExtent\(approxRadiusForNode\(d\)\)/);
  });
});
