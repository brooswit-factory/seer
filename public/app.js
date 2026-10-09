import { colorForNode, outlineForNode, statusLabel, STATUS_COLORS, CANNOT_REPORT_COLOR } from "./colors.js";
import { classifyQueryRecord, queryStatusLabel } from "./query-status.js";

const NODE_RADIUS = 9;
const LABEL_MAX_CHARS = 22;

function truncateLabel(label) {
  if (label.length <= LABEL_MAX_CHARS) return label;
  return label.slice(0, LABEL_MAX_CHARS - 1) + "…";
}

async function main() {
  const graph = await fetch("/graph.json").then((r) => {
    if (!r.ok) throw new Error(`failed to load /graph.json: ${r.status}`);
    return r.json();
  });

  document.getElementById("snapshot-timestamp").textContent = `snapshot: ${graph.snapshotTimestamp}`;

  renderLegend();
  renderQueries(graph.queries);
  renderGraph(graph);
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

function fattenedPoints(nodes, radius, segments = 10) {
  const pts = [];
  for (const n of nodes) {
    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * 2 * Math.PI;
      pts.push([n.x + radius * Math.cos(theta), n.y + radius * Math.sin(theta)]);
    }
  }
  return pts;
}

function renderGraph(graph) {
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

  const nodes = graph.nodes.map((n) => ({ ...n }));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const links = graph.edges
    .filter((e) => nodeById.has(e.source) && nodeById.has(e.target))
    .map((e) => ({ ...e }));

  const sourceIds = [...new Set(nodes.map((n) => n.ownerSourceId))];
  const hullColor = d3.scaleOrdinal(d3.schemeTableau10).domain(sourceIds);

  const simulation = d3
    .forceSimulation(nodes)
    .force(
      "link",
      d3
        .forceLink(links)
        .id((d) => d.id)
        .distance(60),
    )
    .force("charge", d3.forceManyBody().strength(-180))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide(NODE_RADIUS + 4));

  const hullLayer = root.append("g").attr("class", "hulls");
  const edgeLayer = root.append("g").attr("class", "edges");
  const nodeLayer = root.append("g").attr("class", "nodes");

  const edgeSel = edgeLayer
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("class", "edge");

  const nodeSel = nodeLayer
    .selectAll("g.node")
    .data(nodes)
    .join("g")
    .attr("class", "node")
    .call(
      d3
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
        }),
    );

  nodeSel
    .append("circle")
    .attr("r", NODE_RADIUS)
    .attr("fill", (d) => colorForNode(d))
    .attr("stroke", "#11111b")
    .attr("stroke-width", 1.5)
    .attr("stroke-dasharray", (d) => (outlineForNode(d) === "dashed" ? "3,2" : null));

  // link-discovered nodes get a small hollow centre dot, distinguishing them from query hits
  nodeSel
    .filter((d) => d.discovery === "link")
    .append("circle")
    .attr("r", 2.5)
    .attr("fill", "#1e1e2e");

  // admission-withheld: ring overlay, never a fill
  nodeSel
    .filter((d) => d.admissionWithheld)
    .append("circle")
    .attr("class", "admission-ring")
    .attr("r", NODE_RADIUS + 4);

  nodeSel
    .append("text")
    .attr("class", "node-label")
    .attr("dy", NODE_RADIUS + 12)
    .attr("text-anchor", "middle")
    .text((d) => truncateLabel(d.label));

  const tooltip = document.getElementById("tooltip");
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
  nodeSel.on("mouseenter", showTooltip).on("mousemove", showTooltip);
  nodeSel.on("mouseleave", () => {
    tooltip.style.visibility = "hidden";
  });
  nodeSel.on("click", (event, d) => showTooltip(event, d));

  const hullGroups = sourceIds.map((id) => ({
    id,
    path: hullLayer.append("path").attr("class", "hull").attr("fill", hullColor(id)).attr("stroke", hullColor(id)),
    label: hullLayer.append("text").attr("class", "hull-label").text(id),
  }));

  function updateHulls() {
    for (const group of hullGroups) {
      const groupNodes = nodes.filter((n) => n.ownerSourceId === group.id);
      const pts = fattenedPoints(groupNodes, NODE_RADIUS + 18);
      const hull = d3.polygonHull(pts);
      if (hull) {
        group.path.attr("d", `M${hull.map((p) => p.join(",")).join("L")}Z`);
        const [lx, ly] = d3.polygonCentroid(hull);
        const top = d3.min(hull, (p) => p[1]);
        group.label.attr("x", lx).attr("y", top - 6);
      }
    }
  }

  simulation.on("tick", () => {
    edgeSel
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);
    nodeSel.attr("transform", (d) => `translate(${d.x},${d.y})`);
    updateHulls();
  });
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    "beforeend",
    `<pre style="color:#f38ba8;padding:16px">Failed to load graph: ${err.message}</pre>`,
  );
});
