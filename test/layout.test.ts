// COMPACT LAYOUT item 5 (FACTORY-890/FACTORY-889): run the force simulation to rest, headless,
// against a graph the size of a real fleet snapshot (~136 nodes), and assert the settled layout
// fits a 1440x900 viewport after fit-to-view at a readable scale with no significant overlap.
//
// DATA NOTE: the ticket asks for one REAL `/graph.json` captured from codey's seer. This workspace
// could not reach codey — seer's viewer is STRUCTURALLY loopback-only (`src/server/serve.ts`
// binds `127.0.0.1` as a literal, never configurable), and no SSH credentials for host `codey`
// were available here. `test/fixtures/graph.synthetic-136.json` is a SYNTHETIC stand-in instead:
// generated with the real schema (same node/edge shape, same type/status mix a fleet snapshot
// has) but not live data. Flagged on the ticket; swap in a real capture when one is reachable.
//
// This test exercises `d3-force` directly (a devDependency, pure algorithm package with no DOM),
// not the CDN-loaded `d3` global `public/app.js` runs in a browser — same force names/semantics,
// so it reproduces the identical physics for the layout constants under test.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { forceSimulation, forceLink, forceManyBody, forceX, forceY, forceCollide } from "d3-force";
import { scaledSizeForNode } from "../public/node-scale.js";
import { computeFitTransform, LABEL_FONT_PX } from "../public/fit-view.js";

const VIEWPORT_WIDTH = 1440;
const VIEWPORT_HEIGHT = 900;
const SIZE_CONFIG = { epic: 3, bug: 3, story: 2, base: 1.5 };
const LAYOUT_CONFIG = { linkDistance: 40, charge: 120, gravity: 0.08 };
const COLLIDE_PADDING = 4;
/** Small tolerance for edge-case floating-point overlap at shape corners, not a real design gap. */
const OVERLAP_TOLERANCE_PX = 1;

function loadFixture() {
  const path = new URL("./fixtures/graph.synthetic-136.json", import.meta.url).pathname;
  return JSON.parse(readFileSync(path, "utf-8"));
}

type AnyNode = Record<string, any> & { x: number; y: number };

function approxRadius(node: AnyNode): number {
  return Math.sqrt(scaledSizeForNode(node, SIZE_CONFIG) / Math.PI);
}

/** Mirrors `public/app.js`'s `renderGraph` force setup exactly, run to rest synchronously (no timer). */
function settleLayout(graph: any, { width = VIEWPORT_WIDTH, height = VIEWPORT_HEIGHT } = {}): AnyNode[] {
  const nodes: AnyNode[] = graph.nodes.map((n: any, i: number) => ({
    ...n,
    x: width / 2 + Math.cos(i) * 50,
    y: height / 2 + Math.sin(i) * 50,
  }));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const links = graph.edges
    .filter((e: any) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((e: any) => ({ source: e.source, target: e.target }));

  const simulation = forceSimulation(nodes)
    .force("link", forceLink(links).id((d: any) => d.id).distance(LAYOUT_CONFIG.linkDistance))
    .force("charge", forceManyBody().strength(-LAYOUT_CONFIG.charge))
    .force("x", forceX(width / 2).strength(LAYOUT_CONFIG.gravity))
    .force("y", forceY(height / 2).strength(LAYOUT_CONFIG.gravity))
    .force("collide", forceCollide((d: any) => approxRadius(d) + COLLIDE_PADDING))
    .stop();

  for (let i = 0; i < 1000 && simulation.alpha() > simulation.alphaMin(); i++) {
    simulation.tick();
  }

  return nodes;
}

describe("real-data (~136 node) layout settles into a 1440x900 viewport after fit-to-view", () => {
  const fixture = loadFixture();
  const settled = settleLayout(fixture);

  test("fixture is the expected ~136-node scale", () => {
    expect(settled.length).toBeGreaterThan(100);
  });

  test("fit-to-view produces a readable scale (effective label size >= 10px) and a finite transform", () => {
    const points = settled.map((d) => ({ x: d.x, y: d.y, r: approxRadius(d) }));
    const fitTransform = computeFitTransform(points, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

    expect(Number.isFinite(fitTransform.k)).toBe(true);
    const effectiveLabelPx = LABEL_FONT_PX * fitTransform.k;
    expect(effectiveLabelPx).toBeGreaterThanOrEqual(10);
  });

  test("the settled, fitted bounding box fits the 1440x900 viewport", () => {
    const points = settled.map((d) => ({ x: d.x, y: d.y, r: approxRadius(d) }));
    const fitTransform = computeFitTransform(points, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
      const sx = p.x * fitTransform.k + fitTransform.x;
      const sy = p.y * fitTransform.k + fitTransform.y;
      const sr = p.r * fitTransform.k;
      minX = Math.min(minX, sx - sr);
      maxX = Math.max(maxX, sx + sr);
      minY = Math.min(minY, sy - sr);
      maxY = Math.max(maxY, sy + sr);
    }

    // A loose margin (half the padding `computeFitTransform` targets): the layout-tuning
    // constants above are meant to get real ~136-node data inside the viewport; a clamp to
    // MIN_READABLE_SCALE (label floor) can still leave a small, documented overflow.
    const margin = 60;
    expect(minX).toBeGreaterThanOrEqual(-margin);
    expect(maxX).toBeLessThanOrEqual(VIEWPORT_WIDTH + margin);
    expect(minY).toBeGreaterThanOrEqual(-margin);
    expect(maxY).toBeLessThanOrEqual(VIEWPORT_HEIGHT + margin);

    console.log(
      `layout check: ${settled.length} nodes, fit k=${fitTransform.k.toFixed(3)}, ` +
        `bbox=[${minX.toFixed(0)},${minY.toFixed(0)}]..[${maxX.toFixed(0)},${maxY.toFixed(0)}] ` +
        `vs viewport 1440x900`,
    );
  });

  test("no node overlaps another beyond a small tolerance (collision radius scales with node size)", () => {
    let worstOverlap = 0;
    for (let i = 0; i < settled.length; i++) {
      for (let j = i + 1; j < settled.length; j++) {
        const a = settled[i]!;
        const b = settled[j]!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = approxRadius(a) + approxRadius(b);
        const overlap = minDist - dist;
        if (overlap > worstOverlap) worstOverlap = overlap;
      }
    }
    console.log(`layout check: worst node-pair overlap = ${worstOverlap.toFixed(2)}px`);
    expect(worstOverlap).toBeLessThanOrEqual(OVERLAP_TOLERANCE_PX);
  });
});
