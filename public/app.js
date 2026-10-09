import { colorForNode, outlineForNode, statusLabel, STATUS_COLORS, CANNOT_REPORT_COLOR } from "./colors.js";
import { classifyQueryRecord, queryStatusLabel } from "./query-status.js";
import { shapeForNode, sizeForNode, SHAPE_HEXAGON, SHAPE_ROUNDED_SQUARE } from "./shapes.js";

const NODE_RADIUS = 9;
const LABEL_MAX_CHARS = 22;

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

function symbolPathForNode(node) {
  const shape = shapeForNode(node);
  const size = sizeForNode(node);
  return d3.symbol().type(D3_SYMBOL_BY_SHAPE[shape]).size(size)();
}

function approxRadiusForNode(node) {
  return Math.sqrt(sizeForNode(node) / Math.PI);
}

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

  renderShapeLegend();
  renderLegend();
  renderQueries(graph.queries);
  renderGraph(graph);
}

/** A small standalone SVG rendering one shape, stroked with the current theme's `--shape-stroke` token, for the legend. */
function shapeIconSvg(shape) {
  const size = 140; // a fixed legend size, independent of each node's own status-driven size tier
  const path = d3.symbol().type(D3_SYMBOL_BY_SHAPE[shape]).size(size)();
  return `<svg class="shape-icon" width="18" height="18" viewBox="-10 -10 20 20"><path d="${path}" fill="var(--muted)" stroke="var(--shape-stroke)" stroke-width="1.5"></path></svg>`;
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

  // Shape carries resource type (FACTORY-876 item 3); fill stays agent-status colour from
  // colors.js, unchanged — type is never encoded in hue.
  nodeSel
    .append("path")
    .attr("d", (d) => symbolPathForNode(d))
    .attr("fill", (d) => colorForNode(d))
    .attr("stroke", "var(--shape-stroke)")
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
    .attr("r", (d) => approxRadiusForNode(d) + 4);

  nodeSel
    .append("text")
    .attr("class", "node-label")
    .attr("dy", (d) => approxRadiusForNode(d) + 12)
    .attr("text-anchor", "middle")
    .text((d) => truncateLabel(d.label));

  const tooltip = document.getElementById("tooltip");
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
  nodeSel.on("mouseenter", showTooltip).on("mousemove", showTooltip);
  nodeSel.on("mouseleave", () => {
    tooltip.style.visibility = "hidden";
  });
  nodeSel.on("click", (event, d) => showTooltip(event, d));

  simulation.on("tick", () => {
    edgeSel
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);
    nodeSel.attr("transform", (d) => `translate(${d.x},${d.y})`);
  });
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    "beforeend",
    `<pre style="color:#f38ba8;padding:16px">Failed to load graph: ${err.message}</pre>`,
  );
});
