// COMPACT LAYOUT item 5 (FACTORY-890/FACTORY-889/FACTORY-898): run the force simulation to rest,
// headless, against a graph the size of a real fleet snapshot, and assert the settled layout fits
// a 1440x900 viewport after fit-to-view at a readable scale with no significant overlap.
//
// DATA NOTE (FACTORY-898): `test/fixtures/graph.real-capture.json` is REAL data — 141 genuine FACTORY
// Jira issues (project = FACTORY ORDER BY created DESC, cap 100; project = FACTORY AND issuetype =
// Epic ORDER BY created ASC, cap 40; project = FACTORY AND issuetype = "Sub-task", cap 40) captured
// 2026-10-15 via butchr's own authorized `jira_search`/read-only MCP access, not a live seer
// collector run: this workspace still can't reach codey's seer (same structural loopback-bind
// reachability gap FACTORY-889 hit — see `src/server/serve.ts`) or get a JIRA_API_TOKEN to run
// `bun run seer collect` directly. Per the ticket's reviewing Epic (backlog hold audit comment),
// this is the authorized bounded-scope path: real data through existing read-only access, not a
// weakened bind or copied credential. Node fields (agentStatus, resourceType, jiraStatus, labels)
// are mapped exactly as `src/collector/jira.ts`'s `JiraProvider.toMatch` does.
//
// REAL FINDING, not a loosened assertion: this slice of real FACTORY data has ZERO Jira native
// issuelinks and only one `parent` edge (to an issue outside this capture, so unused under
// linkDepth=0) — this fleet's actual practice is cross-referencing work in free-text descriptions,
// not structured Jira links. The captured graph is therefore edge-sparse; layout is driven almost
// entirely by charge + gravity + collision, not forceLink. That is real topology, left as captured.
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
  const path = new URL("./fixtures/graph.real-capture.json", import.meta.url).pathname;
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

describe("real-data (~141 node) layout settles into a 1440x900 viewport after fit-to-view", () => {
  const fixture = loadFixture();
  const settled = settleLayout(fixture);

  test("fixture is the expected ~141-node scale", () => {
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

    // Tightened from an unjustified 60px (FACTORY-898): against the real 141-node capture above,
    // the settled/fitted bbox overflows the viewport by at most ~4px on y (minY=-4, maxY=904 at
    // k=1, the MIN_READABLE_SCALE label floor — see the console.log below for the exact figures
    // measured at the time of writing). 10px is that measured worst case plus a small buffer for
    // normal run-to-run jitter in where the simulation settles; it is not slack nobody has
    // justified. If this starts failing, a real layout-tuning problem is more likely than the
    // margin being wrong — see the ticket's acceptance item 4 before widening it.
    const margin = 10;
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
    admissionWithheld: false,
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

  test("141-node real fixture plus 5 project nodes settle (146 nodes total)", () => {
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

  test("the settled, fitted bounding box (141 real nodes + 5 project nodes) still fits the 1440x900 viewport", () => {
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

    // Tightened from an unjustified 60px (FACTORY-898): adding 5 project nodes to the real
    // capture pushes the measured overflow slightly past the base check's, to ~8px on y
    // (minY=-8, maxY=908 at time of writing) — 12px is that worst case plus a small jitter
    // buffer, same reasoning as the base 141-node check above, not an arbitrary widening.
    const margin = 12;
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
