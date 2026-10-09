import { colorForNode, outlineForNode, statusLabel, STATUS_COLORS, CANNOT_REPORT_COLOR } from "./colors.js";
import { classifyQueryRecord, queryStatusLabel } from "./query-status.js";

const NODE_RADIUS = 9;
const LABEL_MAX_CHARS = 22;
const DEFAULT_REFRESH_SECONDS = 30;

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
  renderLegend();
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

function renderLegend() {
  const el = document.getElementById("legend");
  const rows = [];
  rows.push("<h2>Legend</h2>");
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

  const svg = d3.select("#graph").attr("width", width).attr("height", height);
  const root = svg.append("g");
  svg.call(
    d3.zoom().on("zoom", (event) => {
      root.attr("transform", event.transform);
    }),
  );

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
    .force("link", d3.forceLink(links).id((d) => d.id).distance(60))
    .force("charge", d3.forceManyBody().strength(-180))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide(NODE_RADIUS + 4));

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
    entered.append("circle").attr("class", "node-circle").attr("r", NODE_RADIUS);
    entered.append("text").attr("class", "node-label").attr("dy", NODE_RADIUS + 12).attr("text-anchor", "middle");
    entered.on("mouseenter", showTooltip).on("mousemove", showTooltip).on("mouseleave", hideTooltip).on("click", showTooltip);

    const merged = entered.merge(sel);

    merged
      .select("circle.node-circle")
      .attr("fill", (d) => colorForNode(d))
      .attr("stroke-dasharray", (d) => (outlineForNode(d) === "dashed" ? "3,2" : null));
    merged.select("text.node-label").text((d) => truncateLabel(d.label));

    // discovery dot and admission ring are presence-toggled per node, not just styled, since
    // whether a node has one can change between refreshes (e.g. it starts matching a query).
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
        g.insert("circle", "text").attr("class", "admission-ring").attr("r", NODE_RADIUS + 4);
      } else if (!d.admissionWithheld && hasRing) {
        g.select("circle.admission-ring").remove();
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
