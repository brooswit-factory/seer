import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { MIN_CONTRAST, THEME_TOKENS, contrastRatio, relativeLuminance } from "../public/contrast.js";

/**
 * Reads the ACTUAL theme-token colours out of public/style.css (not a hand-copied constant that
 * could drift from it) and asserts their WCAG 2.x contrast ratio against the canvas background
 * meets the required >= 4.5:1 in both the light (`:root`) and dark (`prefers-color-scheme: dark`)
 * themes — FACTORY-875's hardened acceptance: edges, arrowheads, and node strokes. Node shapes
 * (FACTORY-876) reuse the same `--node-stroke` token rather than a separate one, so this single
 * check covers both.
 */

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join("")}` : hex;
  const int = parseInt(normalized.slice(1), 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function cssRelativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function cssContrastRatio(hexA: string, hexB: string): number {
  const lA = cssRelativeLuminance(hexA);
  const lB = cssRelativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

function extractBlock(css: string, pattern: RegExp): string {
  const match = css.match(pattern);
  const captured = match?.[1];
  if (!captured) throw new Error(`style.css: could not find a block matching ${pattern}`);
  return captured;
}

function extractVar(block: string, name: string): string {
  const match = block.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})`));
  const captured = match?.[1];
  if (!captured) throw new Error(`style.css: variable ${name} not found in block`);
  return captured;
}

const cssPath = new URL("../public/style.css", import.meta.url).pathname;
const css = readFileSync(cssPath, "utf-8");

// The light theme's `:root` block is the first one in the file, outside any @media query.
const lightBlock = extractBlock(css, /:root\s*{([^}]*)}/);
// The dark theme overrides the same tokens inside a `prefers-color-scheme: dark` media query.
const darkBlock = extractBlock(css, /@media\s*\(prefers-color-scheme:\s*dark\)\s*{\s*:root\s*{([^}]*)}/);

const THEMES = {
  light: {
    bg: extractVar(lightBlock, "--bg"),
    edge: extractVar(lightBlock, "--edge"),
    arrowhead: extractVar(lightBlock, "--arrowhead"),
    nodeStroke: extractVar(lightBlock, "--node-stroke"),
  },
  dark: {
    bg: extractVar(darkBlock, "--bg"),
    edge: extractVar(darkBlock, "--edge"),
    arrowhead: extractVar(darkBlock, "--arrowhead"),
    nodeStroke: extractVar(darkBlock, "--node-stroke"),
  },
};

describe("edge/arrowhead/node-stroke contrast against the canvas (WCAG >= 4.5:1, both themes)", () => {
  for (const [themeName, theme] of Object.entries(THEMES)) {
    describe(`${themeName} theme`, () => {
      test("edge colour vs background", () => {
        const ratio = cssContrastRatio(theme.edge, theme.bg);
        expect(ratio).toBeGreaterThanOrEqual(MIN_CONTRAST);
      });

      test("arrowhead colour vs background", () => {
        const ratio = cssContrastRatio(theme.arrowhead, theme.bg);
        expect(ratio).toBeGreaterThanOrEqual(MIN_CONTRAST);
      });

      test("node-stroke colour vs background (also the shape-stroke colour: FACTORY-876 reuses this token)", () => {
        const ratio = cssContrastRatio(theme.nodeStroke, theme.bg);
        expect(ratio).toBeGreaterThanOrEqual(MIN_CONTRAST);
      });
    });
  }

  test("a deliberately low-contrast pair fails this same check (sanity: the test can actually fail)", () => {
    const ratio = cssContrastRatio("#1e1e2e", "#2a2a3a");
    expect(ratio).toBeLessThan(MIN_CONTRAST);
  });
});

describe("contrastRatio", () => {
  test("a colour against itself is exactly 1", () => {
    expect(contrastRatio("#1e1e2e", "#1e1e2e")).toBeCloseTo(1, 5);
  });

  test("black vs white is the maximum ratio, 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  test("is symmetric regardless of argument order", () => {
    expect(contrastRatio("#1e1e2e", "#cdd6f4")).toBeCloseTo(contrastRatio("#cdd6f4", "#1e1e2e"), 10);
  });

  test("relativeLuminance of black is 0 and white is 1", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });
});

describe("seer's node-stroke theme tokens (FACTORY-876 item 3)", () => {
  test("dark theme: --node-stroke against --bg meets WCAG >= 4.5:1", () => {
    const { bg, nodeStroke } = THEME_TOKENS.dark;
    expect(contrastRatio(nodeStroke, bg)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  test("light theme: --node-stroke against --bg meets WCAG >= 4.5:1", () => {
    const { bg, nodeStroke } = THEME_TOKENS.light;
    expect(contrastRatio(nodeStroke, bg)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });
});
