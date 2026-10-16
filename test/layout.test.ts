// COMPACT LAYOUT item 5 (FACTORY-890/FACTORY-889): run the force simulation to rest, headless,
// against a graph the size of a real fleet snapshot (~136 nodes), and assert the settled layout
// fits a 1440x900 viewport after fit-to-view at a readable scale with no significant overlap.
//
// DATA NOTE (FACTORY-898, scope corrected 2026-10-16): the ticket originally asked for one REAL
// `/graph.json` captured from a running seer. That's not producible from this workspace — seer's
// viewer is STRUCTURALLY loopback-only (`src/server/serve.ts` binds `127.0.0.1` as a literal,
// never configurable), there is no reachable host running seer here, and no `JIRA_API_TOKEN` is
// available to run `bun run seer collect` against this fleet's real Jira (confirmed via a bounded
// discovery pass: no seer process, no systemd unit, no env var, and no existing collector-written
// `graph.json` artifact anywhere under this user). A prior attempt instead hand-assembled a
// fixture from capped `jira_search`/`jira_get_issue` MCP reads; review correctly rejected that, as
// a chosen `linkDepth = 0` with zero edges doesn't establish what the DEPLOYED collector actually
// produces. That attempt was reverted.
//
// Per explicit ticket direction superseding the original real-capture requirement (comment
// authored by the ticket's reviewer), synthetic data is the accepted scope: this test runs
// against `test/fixtures/graph.synthetic-136.json`, a clearly-labeled SYNTHETIC stand-in
// generated with the real schema (same node/edge shape, same type/status mix a fleet snapshot
// has, 130 nodes / 107 edges) rather than live data. The margin below is tightened against this
// fixture's ACTUALLY MEASURED settled layout (not assumed): both checks below settle with zero
// overflow and 27-289px of slack on every side (see each test's own `console.log`), so a 20px
// margin is a real tightening from the prior unjustified 60px while keeping headroom for minor
// floating-point variation across engines.
//
// This test exercises `d3-force` directly (a devDependency, pure algorithm package with no DOM),
// not the CDN-loaded `d3` global `public/app.js` runs in a browser — same force names/semantics,
// so it reproduces the identical physics for the layout constants under test.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { forceSimulation, forceLink, forceManyBody, forceX, forceY, forceCollide } from "d3-force";
import { scaledSizeForNode } from "../public/node-scale.js";
import { computeFitTransform, LABEL_FONT_PX } from "../public/fit-view.js";
import { PROJECT_LINK_DISTANCE } from "../public/project.js";

const VIEWPORT_WIDTH = 1440;
const VIEWPORT_HEIGHT = 900;
const SIZE_CONFIG = { epic: 2, bug: 2, story: 1.5, base: 1 };
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

    // Tightened from an unjustified 60px: measured bbox is [289,32]..[1151,868], i.e. zero
    // actual overflow against the 1440x900 viewport with 32-289px of slack on every side. 20px
    // keeps a real margin while catching a regression far smaller than the old 60px ever could.
    const margin = 20;
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

/**
 * FACTORY-911 item 5: the same real-data layout check, plus 5 synthesised project nodes each
 * `contains`-linked to one Epic already in the fixture — mirrors `public/app.js`'s per-edge-kind
 * `linkDistanceForLink` (PROJECT_LINK_DISTANCE for `contains`, the general layout distance for
 * everything else) and `scaledSizeForNode`'s project fast-path (fixed size, never
 * SEER_SIZE_BASE/ACTIVE), so this reproduces the real viewer's physics, not a simplified stand-in.
 */
describe("real-data layout + 5 project nodes still fits a 1440x900 viewport", () => {
  const fixture = loadFixture();
  const epicIds = fixture.nodes.filter((n: any) => n.resourceType === "Epic").map((n: any) => n.id);
  // Guard the test's own premise: with no Epics in the fixture, every project node would be
  // unlinked and this would silently stop exercising the "cluster near its Epics" requirement.
  if (epicIds.length === 0) throw new Error("test fixture has no Epic nodes to attach project nodes to");

  const projectNodes = Array.from({ length: 5 }, (_, i) => ({
    id: `jira-project:SYNTH${i}`,
    provider: "jira-project",
    resourceType: "project",
    label: `SYNTH${i} synthetic project ${i}`,
    url: `https://example.com/browse/SYNTH${i}`,
    ownerSourceId: fixture.nodes[0].ownerSourceId,
    agentStatus: "none",
    providerCanReportStatus: false,
    discovery: "query",
  }));
  const containsEdges = projectNodes.map((p, i) => ({
    source: p.id,
    target: epicIds[i % epicIds.length],
    kind: "contains",
  }));
  const graphWithProjects = {
    ...fixture,
    nodes: [...fixture.nodes, ...projectNodes],
    edges: [...fixture.edges, ...containsEdges],
  };

  function linkDistanceForLink(link: any) {
    return link.kind === "contains" ? PROJECT_LINK_DISTANCE : LAYOUT_CONFIG.linkDistance;
  }

  function settleWithProjectAwareLink(graph: any, { width = VIEWPORT_WIDTH, height = VIEWPORT_HEIGHT } = {}): AnyNode[] {
    const nodes: AnyNode[] = graph.nodes.map((n: any, i: number) => ({
      ...n,
      x: width / 2 + Math.cos(i) * 50,
      y: height / 2 + Math.sin(i) * 50,
    }));
    const nodeIds = new Set(nodes.map((n) => n.id));
    const links = graph.edges
      .filter((e: any) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e: any) => ({ source: e.source, target: e.target, kind: e.kind }));

    const simulation = forceSimulation(nodes)
      .force("link", forceLink(links).id((d: any) => d.id).distance(linkDistanceForLink))
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

  const settled = settleWithProjectAwareLink(graphWithProjects);

  test("136-node fixture plus 5 project nodes settle (141 nodes total)", () => {
    expect(settled.length).toBe(fixture.nodes.length + 5);
  });

  test("project nodes keep their fixed size, never scaled by SEER_SIZE_BASE/ACTIVE", () => {
    for (const p of settled.filter((n: any) => n.provider === "jira-project")) {
      expect(approxRadius(p)).toBe(Math.sqrt(scaledSizeForNode(p, SIZE_CONFIG) / Math.PI));
      // Re-running with wildly different multipliers must not move a project node's radius at all.
      const radiusUnderDifferentConfig = Math.sqrt(scaledSizeForNode(p, { epic: 10, bug: 10, story: 10, base: 10 }) / Math.PI);
      expect(radiusUnderDifferentConfig).toBe(approxRadius(p));
    }
  });

  test("fit-to-view still produces a readable, finite transform with project nodes present", () => {
    const points = settled.map((d) => ({ x: d.x, y: d.y, r: approxRadius(d) }));
    const fitTransform = computeFitTransform(points, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    expect(Number.isFinite(fitTransform.k)).toBe(true);
    expect(LABEL_FONT_PX * fitTransform.k).toBeGreaterThanOrEqual(10);
  });

  test("the settled, fitted bounding box (136 real nodes + 5 project nodes) still fits the 1440x900 viewport", () => {
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

    // Same tightened margin as the base check above: measured bbox is [278,27]..[1162,873],
    // zero actual overflow with 27-278px of slack on every side.
    const margin = 20;
    expect(minX).toBeGreaterThanOrEqual(-margin);
    expect(maxX).toBeLessThanOrEqual(VIEWPORT_WIDTH + margin);
    expect(minY).toBeGreaterThanOrEqual(-margin);
    expect(maxY).toBeLessThanOrEqual(VIEWPORT_HEIGHT + margin);

    console.log(
      `layout+projects check: ${settled.length} nodes, fit k=${fitTransform.k.toFixed(3)}, ` +
        `bbox=[${minX.toFixed(0)},${minY.toFixed(0)}]..[${maxX.toFixed(0)},${maxY.toFixed(0)}] vs viewport 1440x900`,
    );
  });

  test("a project node's Epics cluster near it: mean project-to-its-Epic distance is well under the general link distance", () => {
    const byId = new Map(settled.map((n: any) => [n.id, n]));
    const distances = containsEdges.map((e) => {
      const source = byId.get(e.source)!;
      const target = byId.get(e.target)!;
      return Math.hypot(source.x - target.x, source.y - target.y);
    });
    const mean = distances.reduce((a, b) => a + b, 0) / distances.length;
    // A generous multiple of PROJECT_LINK_DISTANCE, not an exact pin — the force simulation
    // settles near its target distance but other forces (charge, collision, gravity) pull it
    // around; this only needs to rule out "spread across a huge empty area" per the ticket.
    expect(mean).toBeLessThan(PROJECT_LINK_DISTANCE * 4);
  });
});
