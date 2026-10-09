import { colorForNode, outlineForNode, statusLabel, STATUS_COLORS, CANNOT_REPORT_COLOR } from "./colors.js";
import { classifyQueryRecord, queryStatusLabel } from "./query-status.js";
import { shapeForNode, SHAPE_HEXAGON, SHAPE_ROUNDED_SQUARE } from "./shapes.js";
import { scaledSizeForNode } from "./node-scale.js";
import { computeFitTransform } from "./fit-view.js";

const LABEL_MAX_CHARS = 22;
const DEFAULT_REFRESH_SECONDS = 30;
/** Collision-radius padding, px — same margin the pre-FACTORY-890 fixed collide radius (NODE_RADIUS + 4) used. */
const COLLIDE_PADDING = 4;

/**
 * Fallbacks for the FACTORY-890 size/layout constants, used ONLY when `/graph.json` predates them
 * (an old fixture, or a snapshot that bypassed `GraphCache`) — the live server always echoes its
 * real `SEER_SIZE_BASE`/`SEER_SIZE_ACTIVE`/`SEER_LINK_DISTANCE`/`SEER_CHARGE`/`SEER_GRAVITY`
 * (env-sourced, see `src/config/env.ts`) on every response, so these values are never the
 * authoritative source in normal operation.
 */
const FALLBACK_SIZE_CONFIG = { base: 2, active: 8 };
const FALLBACK_LAYOUT_CONFIG = { linkDistance: 40, charge: 120, gravity: 0.08 };

function sizeConfigFromGraph(graph) {
  return {
    base: graph.sizeBase ?? FALLBACK_SIZE_CONFIG.base,
    active: graph.sizeActive ?? FALLBACK_SIZE_CONFIG.active,
  };
}

function layoutConfigFromGraph(graph) {
  return {
    linkDistance: graph.linkDistance ?? FALLBACK_LAYOUT_CONFIG.linkDistance,
    charge: graph.charge ?? FALLBACK_LAYOUT_CONFIG.charge,
    gravity: graph.gravity ?? FALLBACK_LAYOUT_CONFIG.gravity,
  };
}

/** D3 has no builtin hexagon/rounded-square symbol type, so these two are drawn by hand using the same `{ draw(context, size) }` contract every builtin `d3.symbolXxx` implements. */
const hexagonSymbol = {
  draw(context, size) {
    const r = Math.sqrt((2 * size) / (3 * Math.sqrt(3)));
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 2;
      const x = r * Math.cos(angle);
      const y = r * Math.sin(angle);
      if (i === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
  },
};

const roundedSquareSymbol = {
  draw(context, size) {
    const half = Math.sqrt(size) / 2;
    const r = half * 0.3;
    context.moveTo(-half + r, -half);
    context.lineTo(half - r, -half);
    context.quadraticCurveTo(half, -half, half, -half + r);
    context.lineTo(half, half - r);
    context.quadraticCurveTo(half, half, half - r, half);
    context.lineTo(-half + r, half);
    context.quadraticCurveTo(-half, half, -half, half - r);
    context.lineTo(-half, -half + r);
    context.quadraticCurveTo(-half, -half, -half + r, -half);
    context.closePath();
  },
};

const D3_SYMBOL_BY_SHAPE = {
  circle: d3.symbolCircle,
  square: d3.symbolSquare,
  triangle: d3.symbolTriangle,
  diamond: d3.symbolDiamond,
  star: d3.symbolStar,
  [SHAPE_HEXAGON]: hexagonSymbol,
  [SHAPE_ROUNDED_SQUARE]: roundedSquareSymbol,
};

function truncateLabel(label) {
  if (label.length <= LABEL_MAX_CHARS) return label;
  return label.slice(0, LABEL_MAX_CHARS - 1) + "…";
}

async function fetchGraph() {
  const res = await fetch("/graph.json");
  if (!res.ok) throw new Error(`failed to load /graph.json: ${res.status}`);
  return res.json();
}

function formatTime(iso) {
  if (!iso) return "unknown time";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown time";
  return d.toLocaleTimeString();
}

/** The honesty requirement this exists for (FACTORY-875): fresh, stale, and "never collected" must all read differently. */
function renderBanner(graph) {
  const el = document.getElementById("snapshot-timestamp");
  if (graph.usingFixture) {
    el.textContent = "showing the example fixture — no live Jira data collected yet";
    el.className = "timestamp stale";
  } else if (graph.stale) {
    const since = formatTime(graph.staleSince ?? graph.snapshotTimestamp);
    el.textContent = `STALE since ${since}${graph.error ? ` — ${graph.error}` : ""}`;
    el.className = "timestamp stale";
  } else {
    el.textContent = `live as of ${formatTime(graph.snapshotTimestamp)}`;
    el.className = "timestamp fresh";
  }
}

async function main() {
  const graph = await fetchGraph();

  renderBanner(graph);
  renderShapeLegend();
  renderLegend();
  renderSizeLegend(graph);
  renderQueries(graph.queries);
  const update = renderGraph(graph);

  const intervalMs = Math.max(1, graph.refreshSeconds ?? DEFAULT_REFRESH_SECONDS) * 1000;
  setInterval(async () => {
    try {
      const next = await fetchGraph();
      renderBanner(next);
      renderQueries(next.queries);
      update(next);
    } catch (err) {
      console.error("seer: refresh failed", err);
    }
  }, intervalMs);
}

/** A small standalone SVG rendering one shape, stroked with the current theme's `--node-stroke` token, for the legend. */
function shapeIconSvg(shape) {
  const size = 140; // a fixed legend size, independent of each node's own status-driven size tier
  const path = d3.symbol().type(D3_SYMBOL_BY_SHAPE[shape]).size(size)();
  return `<svg class="shape-icon" width="18" height="18" viewBox="-10 -10 20 20"><path d="${path}" fill="var(--muted)" stroke="var(--node-stroke)" stroke-width="1.5"></path></svg>`;
}

/** Type -> shape legend (FACTORY-876 item 4) — a different thing from the per-source grouping legend FACTORY-874 removed. */
function renderShapeLegend() {
  const el = document.getElementById("shape-legend");
  const rows = ["<h2>Type → shape</h2>"];
  const entries = [
    ["Epic", SHAPE_HEXAGON],
    ["Story", "square"],
    ["Task", "circle"],
    ["Bug", "triangle"],
    ["Sub-task", "diamond"],
    ["other/unknown Jira type", SHAPE_ROUNDED_SQUARE],
    ["non-Jira resource", "star"],
  ];
  for (const [label, shape] of entries) {
    rows.push(`<div class="legend-row">${shapeIconSvg(shape)}<span>${label}</span></div>`);
  }
  el.innerHTML = rows.join("");
}

function renderLegend() {
  const el = document.getElementById("legend");
  const rows = [];
  rows.push("<h2>Status → colour</h2>");
  for (const [status, hex] of Object.entries(STATUS_COLORS)) {
    rows.push(
      `<div class="legend-row"><span class="swatch" style="background:${hex}"></span><span>${status}</span></div>`,
    );
  }
  rows.push(
    `<div class="legend-row"><span class="swatch dashed" style="background:${CANNOT_REPORT_COLOR};border-color:${CANNOT_REPORT_COLOR}"></span><span>cannot report status (same neutral as "none", dashed outline)</span></div>`,
  );
  rows.push(
    `<div class="legend-row"><span class="swatch" style="background:none;border:2px dashed #fab387"></span><span>admission withheld (ring overlay, never a fill)</span></div>`,
  );
  rows.push(
    `<div class="legend-row"><span style="width:14px;text-align:center">○</span><span>hollow dot in a node = link-discovered (no query matched it directly)</span></div>`,
  );
  el.innerHTML = rows.join("");
}

/** Size legend (FACTORY-890): shows the server's actual SEER_SIZE_BASE/SEER_SIZE_ACTIVE, never hardcoded. */
function renderSizeLegend(graph) {
  const el = document.getElementById("size-legend");
  const { base, active } = sizeConfigFromGraph(graph);
  el.innerHTML = [
    "<h2>Node size</h2>",
    `<div class="legend-row"><span>${base}x — base size (every node)</span></div>`,
    `<div class="legend-row"><span>${active}x — live agent (working, blocked, idle, or stalled; replaces the base multiplier, not stacked)</span></div>`,
  ].join("");
}

function renderQueries(queries) {
  const el = document.getElementById("queries");
  const rows = ["<h2>Queries</h2>"];
  for (const q of queries) {
    const cls = classifyQueryRecord(q);
    rows.push(
      `<div class="query-row ${cls}"><strong>${q.sourceId}</strong> / ${q.provider} — ${queryStatusLabel(q)}` +
        `<span class="query-text">${escapeHtml(q.query)}</span></div>`,
    );
  }
  el.innerHTML = rows.join("");
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function edgeKey(e) {
  const source = typeof e.source === "object" ? e.source.id : e.source;
  const target = typeof e.target === "object" ? e.target.id : e.target;
  return `${source}|${target}|${e.kind}`;
}

/**
 * Builds the force-directed view ONCE and returns an `update(graph)` function for every
 * subsequent poll. Nodes/links are kept in stable arrays, mutated in place by id (FACTORY-875):
 * an existing node's `x`/`y`/velocity/pin state is preserved across a refresh, a new node is
 * seeded near the canvas centre and left to the simulation to place, and a removed node is
 * dropped — the simulation is only gently reheated (`alpha`, not restarted) when the node/edge
 * set actually changed, so unaffected nodes never jump.
 */
function renderGraph(initialGraph) {
  const wrap = document.getElementById("graph-wrap");
  const width = wrap.clientWidth;
  const height = wrap.clientHeight;

  let sizeConfig = sizeConfigFromGraph(initialGraph);
  let layoutConfig = layoutConfigFromGraph(initialGraph);
  // Set once the user pans/zooms by hand (a real gesture, `event.sourceEvent` present) — an
  // auto-fit (load, refresh, or the Fit button) never counts, since it drives the SAME zoom
  // behaviour programmatically with no `sourceEvent`. COMPACT LAYOUT item 1: once true, a refresh
  // keeps the user's own transform instead of re-fitting out from under them.
  let userTransformed = false;

  const svg = d3.select("#graph").attr("width", width).attr("height", height);
  const root = svg.append("g");
  const zoomBehavior = d3.zoom().on("zoom", (event) => {
    root.attr("transform", event.transform);
    if (event.sourceEvent) userTransformed = true;
  });
  svg.call(zoomBehavior);

  function symbolPathForNode(node) {
    const shape = shapeForNode(node);
    const size = scaledSizeForNode(node, sizeConfig);
    return d3.symbol().type(D3_SYMBOL_BY_SHAPE[shape]).size(size)();
  }

  function approxRadiusForNode(node) {
    return Math.sqrt(scaledSizeForNode(node, sizeConfig) / Math.PI);
  }

  /** Re-fits the view to the current node positions, unless the user has since panned/zoomed by hand. */
  function fit({ force = false } = {}) {
    if (userTransformed && !force) return;
    const points = nodes.map((d) => ({ x: d.x, y: d.y, r: approxRadiusForNode(d) }));
    const { x, y, k } = computeFitTransform(points, width, height);
    svg
      .transition()
      .duration(300)
      .call(zoomBehavior.transform, d3.zoomIdentity.translate(x, y).scale(k));
    // This transform is programmatic (no sourceEvent), but set explicitly anyway — this is the
    // one place a user's prior pan/zoom is deliberately overridden (a `force`-d Fit click).
    userTransformed = false;
  }

  document.getElementById("fit-button")?.addEventListener("click", () => fit({ force: true }));

  const defs = svg.append("defs");
  defs
    .append("marker")
    .attr("id", "seer-arrowhead")
    .attr("viewBox", "0 0 10 10")
    .attr("refX", 9)
    .attr("refY", 5)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto-start-reverse")
    .append("path")
    .attr("class", "edge-arrowhead")
    .attr("d", "M0,0 L10,5 L0,10 z");

  const edgeLayer = root.append("g").attr("class", "edges");
  const nodeLayer = root.append("g").attr("class", "nodes");
  const tooltip = document.getElementById("tooltip");

  const nodes = [];
  const nodeById = new Map();
  let links = [];
  let edgeSel = edgeLayer.selectAll("line.edge");

  const simulation = d3
    .forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((d) => d.id).distance(layoutConfig.linkDistance))
    .force("charge", d3.forceManyBody().strength(-layoutConfig.charge))
    // Centering/gravity (COMPACT LAYOUT item 3): a per-node spring toward the centre, SEER_GRAVITY
    // strength, so disconnected components drift together instead of spreading into empty space.
    .force("x", d3.forceX(width / 2).strength(layoutConfig.gravity))
    .force("y", d3.forceY(height / 2).strength(layoutConfig.gravity))
    // Collision radius follows each node's OWN scaled size (COMPACT LAYOUT item 4) — a function,
    // not the old fixed NODE_RADIUS + 4, so an 8x live-agent node pushes its neighbours away
    // proportionally to how big it actually is drawn.
    .force("collide", d3.forceCollide((d) => approxRadiusForNode(d) + COLLIDE_PADDING));

  simulation.on("end", () => fit());

  function dragBehavior() {
    return d3
      .drag()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
  }

  function showTooltip(event, d) {
    tooltip.innerHTML = `<dl>
      <dt>label</dt><dd>${escapeHtml(d.label)}</dd>
      <dt>provider</dt><dd>${escapeHtml(d.provider)}</dd>
      <dt>id</dt><dd>${escapeHtml(d.id)}</dd>
      <dt>type</dt><dd>${escapeHtml(d.resourceType ?? "unknown")}</dd>
      <dt>status</dt><dd>${escapeHtml(statusLabel(d))}</dd>
      <dt>discovery</dt><dd>${d.discovery === "query" ? "query hit" : "link-discovered"}</dd>
      <dt>link</dt><dd><a href="${d.url}" target="_blank" rel="noopener">${escapeHtml(d.url)}</a></dd>
    </dl>`;
    tooltip.style.visibility = "visible";
    tooltip.style.left = `${event.offsetX + 16}px`;
    tooltip.style.top = `${event.offsetY + 16}px`;
  }
  function hideTooltip() {
    tooltip.style.visibility = "hidden";
  }

  function renderNodeSelection() {
    const sel = nodeLayer.selectAll("g.node").data(nodes, (d) => d.id);
    sel.exit().remove();

    const entered = sel.enter().append("g").attr("class", "node").call(dragBehavior());
    // Shape carries resource type (FACTORY-876 item 3); fill stays agent-status colour from
    // colors.js, unchanged — type is never encoded in hue.
    entered
      .append("path")
      .attr("class", "node-shape")
      .attr("stroke", "var(--node-stroke)")
      .attr("stroke-width", 1.5);
    entered.append("text").attr("class", "node-label").attr("text-anchor", "middle");
    entered.on("mouseenter", showTooltip).on("mousemove", showTooltip).on("mouseleave", hideTooltip).on("click", showTooltip);

    const merged = entered.merge(sel);

    // Re-run on every refresh, not just on enter: a node whose resourceType (or anything else
    // shape-relevant) changed needs its path/size/label offset to follow, in place.
    merged
      .select("path.node-shape")
      .attr("d", (d) => symbolPathForNode(d))
      .attr("fill", (d) => colorForNode(d))
      .attr("stroke-dasharray", (d) => (outlineForNode(d) === "dashed" ? "3,2" : null));
    merged
      .select("text.node-label")
      .attr("dy", (d) => approxRadiusForNode(d) + 12)
      .text((d) => truncateLabel(d.label));

    // discovery dot and admission ring are presence-toggled per node, not just styled, since
    // whether a node has one can change between refreshes (e.g. it starts matching a query).
    // Their radius is re-derived every pass too, since a node's shape/size can change underneath
    // an existing ring.
    merged.each(function (d) {
      const g = d3.select(this);
      const hasDot = !g.select("circle.discovery-dot").empty();
      if (d.discovery === "link" && !hasDot) {
        g.insert("circle", "text").attr("class", "discovery-dot").attr("r", 2.5).attr("fill", "#1e1e2e");
      } else if (d.discovery !== "link" && hasDot) {
        g.select("circle.discovery-dot").remove();
      }

      const hasRing = !g.select("circle.admission-ring").empty();
      if (d.admissionWithheld && !hasRing) {
        g.insert("circle", "text").attr("class", "admission-ring").attr("r", approxRadiusForNode(d) + 4);
      } else if (!d.admissionWithheld && hasRing) {
        g.select("circle.admission-ring").remove();
      } else if (d.admissionWithheld && hasRing) {
        g.select("circle.admission-ring").attr("r", approxRadiusForNode(d) + 4);
      }
    });

    return merged;
  }

  function renderEdgeSelection() {
    edgeSel = edgeLayer
      .selectAll("line.edge")
      .data(links, edgeKey)
      .join("line")
      .attr("class", "edge")
      .attr("marker-end", "url(#seer-arrowhead)");
  }

  let nodeSel = nodeLayer.selectAll("g.node");

  simulation.on("tick", () => {
    edgeSel
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);
    nodeSel.attr("transform", (d) => `translate(${d.x},${d.y})`);
  });

  function apply(graph) {
    sizeConfig = sizeConfigFromGraph(graph);
    layoutConfig = layoutConfigFromGraph(graph);
    simulation.force("link").distance(layoutConfig.linkDistance);
    simulation.force("charge").strength(-layoutConfig.charge);
    simulation.force("x").x(width / 2).strength(layoutConfig.gravity);
    simulation.force("y").y(height / 2).strength(layoutConfig.gravity);

    const incomingNodes = graph.nodes;
    const incomingIds = new Set(incomingNodes.map((n) => n.id));

    let added = false;
    let removed = false;

    // Remove nodes no longer present, preserving array identity for the rest.
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (!incomingIds.has(nodes[i].id)) {
        nodeById.delete(nodes[i].id);
        nodes.splice(i, 1);
        removed = true;
      }
    }

    for (const incoming of incomingNodes) {
      const existing = nodeById.get(incoming.id);
      if (existing) {
        // Update every field EXCEPT position/velocity/pin state, so an unchanged node never jumps.
        Object.assign(existing, incoming);
      } else {
        const fresh = { ...incoming, x: width / 2 + (Math.random() - 0.5) * 40, y: height / 2 + (Math.random() - 0.5) * 40 };
        nodes.push(fresh);
        nodeById.set(fresh.id, fresh);
        added = true;
      }
    }

    const incomingLinks = graph.edges.filter((e) => incomingIds.has(e.source) && incomingIds.has(e.target));
    const previousLinkKeys = new Set(links.map(edgeKey));
    const nextLinkKeys = new Set(incomingLinks.map((e) => `${e.source}|${e.target}|${e.kind}`));
    const linksChanged = previousLinkKeys.size !== nextLinkKeys.size || [...nextLinkKeys].some((k) => !previousLinkKeys.has(k));
    links = incomingLinks.map((e) => ({ source: e.source, target: e.target, kind: e.kind }));

    simulation.nodes(nodes);
    simulation.force("link").links(links);

    nodeSel = renderNodeSelection();
    renderEdgeSelection();

    if (added || removed || linksChanged) {
      // A gentle reheat, NOT `.alpha(1).restart()` — existing nodes keep their current x/y as
      // the starting point, so only genuinely new/affected nodes visibly move into place.
      simulation.alpha(Math.max(simulation.alpha(), 0.3)).restart();
    }
  }

  apply(initialGraph);
  return apply;
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    "beforeend",
    `<pre style="color:#f38ba8;padding:16px">Failed to load graph: ${err.message}</pre>`,
  );
});
