import { describe, expect, test } from "bun:test";
import { computeFitTransform, MIN_READABLE_SCALE, shouldFit } from "../public/fit-view.js";

type Point = { x: number; y: number; r?: number };
type Transform = { x: number; y: number; k: number };

function applyTransform(points: Point[], transform: Transform): Point[] {
  return points.map((p) => ({ x: p.x * transform.k + transform.x, y: p.y * transform.k + transform.y, r: (p.r ?? 0) * transform.k }));
}

function boundingBox(points: Point[]) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    const r = p.r ?? 0;
    minX = Math.min(minX, p.x - r);
    maxX = Math.max(maxX, p.x + r);
    minY = Math.min(minY, p.y - r);
    maxY = Math.max(maxY, p.y + r);
  }
  return { minX, maxX, minY, maxY };
}

describe("computeFitTransform", () => {
  test("no points: identity-ish transform centred on the viewport, no crash", () => {
    const t = computeFitTransform([], 1440, 900);
    expect(t.x).toBe(720);
    expect(t.y).toBe(450);
    expect(t.k).toBe(1);
  });

  test("a tight cluster well inside the viewport fits without zooming out past MIN_READABLE_SCALE", () => {
    const points = [{ x: 0, y: 0, r: 10 }, { x: 20, y: 10, r: 10 }, { x: -15, y: 5, r: 10 }];
    const t = computeFitTransform(points, 1440, 900);
    expect(t.k).toBeGreaterThanOrEqual(MIN_READABLE_SCALE);
    const transformed = boundingBox(applyTransform(points, t));
    expect(transformed.minX).toBeGreaterThanOrEqual(0);
    expect(transformed.maxX).toBeLessThanOrEqual(1440);
    expect(transformed.minY).toBeGreaterThanOrEqual(0);
    expect(transformed.maxY).toBeLessThanOrEqual(900);
  });

  test("a bounding box wider than the viewport never scales below MIN_READABLE_SCALE (label readability floor)", () => {
    const points = [{ x: -5000, y: 0, r: 20 }, { x: 5000, y: 0, r: 20 }];
    const t = computeFitTransform(points, 1440, 900);
    expect(t.k).toBe(MIN_READABLE_SCALE);
  });

  test("result centres the bounding box in the viewport", () => {
    const points = [{ x: 100, y: 200, r: 5 }, { x: 140, y: 240, r: 5 }];
    const t = computeFitTransform(points, 1440, 900, { padding: 0 });
    const centerX = (100 + 140) / 2;
    const centerY = (200 + 240) / 2;
    expect(t.x + t.k * centerX).toBeCloseTo(720, 5);
    expect(t.y + t.k * centerY).toBeCloseTo(450, 5);
  });

  test("never returns a non-finite transform", () => {
    const t = computeFitTransform([{ x: 0, y: 0, r: 0 }], 1440, 900);
    expect(Number.isFinite(t.x)).toBe(true);
    expect(Number.isFinite(t.y)).toBe(true);
    expect(Number.isFinite(t.k)).toBe(true);
  });
});

describe("shouldFit (FACTORY-897: re-fit trigger on status-only refresh)", () => {
  test("a status-only refresh (no user pan/zoom yet) re-fits", () => {
    expect(shouldFit({ userTransformed: false, force: false })).toBe(true);
  });

  test("a refresh after the user has panned/zoomed does NOT re-fit", () => {
    expect(shouldFit({ userTransformed: true, force: false })).toBe(false);
  });

  test("the Fit button overrides a prior user pan/zoom", () => {
    expect(shouldFit({ userTransformed: true, force: true })).toBe(true);
  });

  test("force on an untouched view still fits (no-op either way)", () => {
    expect(shouldFit({ userTransformed: false, force: true })).toBe(true);
  });
});
