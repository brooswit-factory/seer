import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { farthestPointRadius } from "../public/node-boundary.js";

// app.js is plain <script type="module">, no DOM test harness in this repo (see
// test/sidebar-panel.test.ts for the existing precedent) — `farthestPointRadius`'s geometry is
// exercised headlessly here against hand-written symbol draws matching d3-shape's own algorithms
// (app.js supplies the real d3 symbol types/custom hexagon+roundedSquare draws at runtime; this
// module never imports d3 itself), while the source-level check confirms app.js actually uses the
// result — instead of the equal-area `approxRadiusForNode` PR #42 shipped with and brooswit's
// review (CHANGES_REQUESTED @ 26d3566) flagged as still burying the arrowhead tip under
// non-circular shapes — to clip each edge.
function readAppJs(): string {
  const path = new URL("../public/app.js", import.meta.url).pathname;
  return readFileSync(path, "utf-8");
}

// d3.symbolSquare: side = sqrt(size), centred on the origin.
const squareSymbol = {
  draw(context: any, size: number) {
    const w = Math.sqrt(size);
    const x = -w / 2;
    context.rect(x, x, w, w);
  },
};

// d3.symbolTriangle: an equilateral triangle, one vertex straight up, centred on the origin.
const triangleSymbol = {
  draw(context: any, size: number) {
    const sqrt3 = Math.sqrt(3);
    const y = -Math.sqrt(size / (sqrt3 * 3));
    context.moveTo(0, y * 2);
    context.lineTo(-sqrt3 * y, -y);
    context.lineTo(sqrt3 * y, -y);
    context.closePath();
  },
};

// d3.symbolCircle: the one shape where the pre-fix equal-area radius was already exact.
const circleSymbol = {
  draw(context: any, size: number) {
    const r = Math.sqrt(size / Math.PI);
    context.moveTo(r, 0);
    context.arc(0, 0, r, 0, 2 * Math.PI);
  },
};

describe("farthestPointRadius (FACTORY-882 review: a conservative per-shape enclosing radius)", () => {
  test("a square's farthest point is its corner, sqrt(size/2) — NOT the smaller equal-area-circle radius", () => {
    const size = 200; // Story's own SHAPE_SIZES tier
    const r = farthestPointRadius(squareSymbol, size);
    expect(r).toBeCloseTo(Math.sqrt(size / 2), 6);
    expect(r).toBeGreaterThan(Math.sqrt(size / Math.PI)); // strictly past the equal-area circle
  });

  test("a Bug (triangle) entered from directly above lands on its apex, not inside the equal-area circle", () => {
    // The exact case brooswit's review raised: default Bug size 160, scaled x2 -> area 640,
    // edge arriving from source (0,-100) i.e. straight down onto the apex at (0, -22.196...).
    const size = 640;
    const r = farthestPointRadius(triangleSymbol, size);
    expect(r).toBeCloseTo(22.196, 2); // matches the review comment's own stated apex y-coordinate
    expect(r).toBeGreaterThan(Math.sqrt(size / Math.PI));
  });

  test("a circle's farthest point is just its own radius (the one shape equal-area already got right)", () => {
    const size = 160;
    const r = farthestPointRadius(circleSymbol, size);
    expect(r).toBeCloseTo(Math.sqrt(size / Math.PI), 6);
  });
});

describe("app.js wiring (source-level, no DOM harness available)", () => {
  test("renderPositions clips edges with enclosingRadiusForNode, not the equal-area approxRadiusForNode", () => {
    const src = readAppJs();
    const fn = src.slice(src.indexOf("function renderPositions"), src.indexOf("function renderPositions") + 700);
    expect(fn).toContain("enclosingRadiusForNode(d.target)");
    expect(fn).not.toContain("approxRadiusForNode(d.target)");
  });

  test("enclosingRadiusForNode derives from the node's actual drawn shape (farthestPointRadius) plus border clearance", () => {
    const src = readAppJs();
    const fn = src.slice(src.indexOf("function enclosingRadiusForNode"), src.indexOf("function enclosingRadiusForNode") + 400);
    expect(fn).toContain("farthestPointRadius(D3_SYMBOL_BY_SHAPE[shape], size)");
    expect(fn).toContain("BORDER_WIDTH / 2");
  });
});
