import { describe, expect, test } from "bun:test";
import { MIN_CONTRAST, THEME_TOKENS, contrastRatio, relativeLuminance } from "../public/contrast.js";

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

describe("seer's shape-stroke theme tokens (FACTORY-876 item 3)", () => {
  test("dark theme: --shape-stroke against --bg meets WCAG >= 4.5:1", () => {
    const { bg, shapeStroke } = THEME_TOKENS.dark;
    expect(contrastRatio(shapeStroke, bg)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  test("light theme: --shape-stroke against --bg meets WCAG >= 4.5:1", () => {
    const { bg, shapeStroke } = THEME_TOKENS.light;
    expect(contrastRatio(shapeStroke, bg)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });
});
