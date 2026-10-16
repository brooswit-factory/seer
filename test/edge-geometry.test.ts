import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { edgeEndPoint } from "../public/edge-geometry.js";

// app.js is plain <script type="module">, no DOM test harness in this repo (see
// test/sidebar-panel.test.ts for the existing precedent) — `edgeEndPoint`'s geometry is exercised
// headlessly here, while this source-level check confirms app.js actually DRIVES it from
// `renderPositions`, the one place that sets an edge's x2/y2 (FACTORY-882: a line drawn to the
// target's raw centre buries `marker-end`'s arrowhead under the opaque node shape painted on top).
function readAppJs(): string {
  const path = new URL("../public/app.js", import.meta.url).pathname;
  return readFileSync(path, "utf-8");
}

describe("edgeEndPoint (FACTORY-882: pull the edge's end point back to the target's boundary)", () => {
  test("stops short of the target by exactly its radius, along the source->target line", () => {
    const p = edgeEndPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    expect(p.x).toBeCloseTo(90, 6);
    expect(p.y).toBeCloseTo(0, 6);
  });

  test("works along a diagonal, not just the axes", () => {
    // source->target is a 3-4-5 triangle, distance 5; pulling back by radius 1 moves 1/5 of the way.
    const p = edgeEndPoint({ x: 0, y: 0 }, { x: 3, y: 4 }, 1);
    expect(p.x).toBeCloseTo(3 - 3 / 5, 6);
    expect(p.y).toBeCloseTo(4 - 4 / 5, 6);
  });

  test("falls back to the source point rather than overshooting past it when radius >= distance", () => {
    const coincident = edgeEndPoint({ x: 5, y: 5 }, { x: 5, y: 5 }, 10);
    expect(coincident).toEqual({ x: 5, y: 5 });

    const closerThanRadius = edgeEndPoint({ x: 0, y: 0 }, { x: 4, y: 0 }, 10);
    expect(closerThanRadius).toEqual({ x: 0, y: 0 });
  });

  test("a zero radius leaves the end point at the target (no-op, matches the pre-fix behaviour)", () => {
    const p = edgeEndPoint({ x: 0, y: 0 }, { x: 7, y: -3 }, 0);
    expect(p.x).toBeCloseTo(7, 6);
    expect(p.y).toBeCloseTo(-3, 6);
  });

  test("app.js's renderPositions sets edge x2/y2 from edgeEndPoint, not the target's raw x/y", () => {
    const src = readAppJs();
    const renderPositions = src.slice(src.indexOf("function renderPositions"), src.indexOf("function renderPositions") + 600);
    expect(renderPositions).toContain("edgeEndPoint(d.source, d.target, approxRadiusForNode(d.target))");
  });
});
