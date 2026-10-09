import { colorForNode, STATUS_COLORS, CANNOT_REPORT_COLOR } from "./colors.js";
import { jiraBorderForNode, JIRA_STATUS_BORDERS } from "./jira-status.js";
import { classifyQueryRecord, queryStatusLabel } from "./query-status.js";
import { shapeForNode, borderForNode, fillInsetForNode, shouldShowDiscoveryDot, BORDER_GAP_WIDTH, SHAPE_HEXAGON, SHAPE_ROUNDED_SQUARE } from "./shapes.js";
import { scaledSizeForNode } from "./node-scale.js";
import { computeFitTransform, shouldFit } from "./fit-view.js";
import { isProjectNode, projectFill, SHAPE_PROJECT, PROJECT_LINK_DISTANCE } from "./project.js";
import { nodeInfoHtml, escapeHtml } from "./node-info.js";
import { createSelectionState, select as selectNode, deselect as deselectNode, reconcileSelection } from "./selection.js";
import { sortNodesForSidebar, filterNodesForSidebar } from "./sidebar-list.js";
import { splitNodeLabel, maxCharsForRadius, truncateToChars, line1Dy, labelBottomExtent, LINE2_FONT_SCALE, LINE_SPACING_PX } from "./node-label.js";
import { animationClassFor, staggerDelayMs, PULSE_BODY_WORKING, PULSE_BORDER_STALLED, PULSE_BORDER_BLOCKED } from "./agent-animation.js";
import { loadAnimationsEnabled, saveAnimationsEnabled } from "./animation-prefs.js";

/** Extra radius (px), on top of the admission ring's own gap, the selection halo (FACTORY-957 item 4) is drawn at — distinct from `ADMISSION_RING_GAP` below so the two rings never collide even when a node has both. */
const SELECTION_HALO_GAP = 13;

const DEFAULT_REFRESH_SECONDS = 30;
/** Collision-radius padding, px — same margin the pre-FACTORY-890 fixed collide radius (NODE_RADIUS + 4) used. */
const COLLIDE_PADDING = 4;
/**
 * The query-hit dot's fixed radius (FACTORY-900 item 7, Brooswit: "the hollow dot in a node
 * should be 1x") — deliberately NOT derived from `scaledSizeForNode`/SEER_SIZE_*: it marks
 * discovery, not size, and must read identically on a base-size and a live-agent node.
 * FACTORY-945 (Brooswit, via FACTORY-943's addendum) FLIPPED which discovery value draws it: a
 * dot now marks a direct query hit (`discovery === "query"`), not a link-discovered node — "Dots
 * on those that the query hits, no dots on the others." A project node (FACTORY-911) never gets
 * one either way, query-hit or not — it's a synthesised container, not a matched resource.
 */
const DISCOVERY_DOT_RADIUS = 2.5;
/**
 * Gap (px) between a node's own shape (now carrying the Jira-status border stroke directly,
 * FACTORY-939) and the (older, FACTORY-855) admission-withheld ring — kept at the FACTORY-900
 * width rather than reverting to the pre-FACTORY-900 `+4` since the shape's own border is now a
 * full 3-4px stroke (vs. the old plain 1.5px `--node-stroke`), so the extra clearance still
 * matters to keep the two read as distinct circles.
 */
const ADMISSION_RING_GAP = 9;

/** "light" | "dark", read live off the OS/browser preference — the Jira-status border palette is a theme token pair (FACTORY-900 item 2, FACTORY-939), not a single hardcoded table. */
function currentTheme() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Fallbacks for the FACTORY-890/913 size/layout constants, used ONLY when `/graph.json` predates
 * them (an old fixture, or a snapshot that bypassed `GraphCache`) — the live server always echoes
 * its real `SEER_SIZE_EPIC`/`SEER_SIZE_BUG`/`SEER_SIZE_STORY`/`SEER_SIZE_BASE`/
 * `SEER_LINK_DISTANCE`/`SEER_CHARGE`/`SEER_GRAVITY` (env-sourced, see `src/config/env.ts`) on
 * every response, so these values are never the authoritative source in normal operation.
 *
 * DECISION (FACTORY-913): kept as literal fallbacks matching `loadSizeConfig()`'s own defaults,
 * same pattern the pre-existing layout fallback already used — not a "derive from meta only, or
 * fail visibly" scheme, since that would turn a merely-stale `/graph.json` (the committed
 * fixture, or a snapshot taken before this change) into a broken or blank viewer instead of a
 * same-as-before one. The live path never reads these; only `test/fixtures` or a pre-FACTORY-913
 * snapshot would.
 */
const FALLBACK_SIZE_CONFIG = { epic: 2, bug: 2, story: 1.5, base: 1 };
const FALLBACK_LAYOUT_CONFIG = { linkDistance: 40, charge: 120, gravity: 0.08 };

function sizeConfigFromGraph(graph) {
  return {
    epic: graph.sizeEpic ?? FALLBACK_SIZE_CONFIG.epic,
    bug: graph.sizeBug ?? FALLBACK_SIZE_CONFIG.bug,
    story: graph.sizeStory ?? FALLBACK_SIZE_CONFIG.story,
    base: graph.sizeBase ?? FALLBACK_SIZE_CONFIG.base,
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
  [SHAPE_PROJECT]: d3.symbolWye,
};

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

/**
 * FACTORY-957: left node-list sidebar + right-panel legend/node-info toggle. `main()` owns the
 * one `selectionState` value (public/selection.js's pure reducer) and is the sole writer of it —
 * `renderGraph`'s returned API mirrors just the id for haloing/panning, and the DOM glue below
 * (list rows, filter box, close button, keyboard nav) only ever calls the reducer functions, never
 * mutates DOM selection state directly.
 */
async function main() {
  const graph = await fetchGraph();

  renderBanner(graph);
  renderShapeLegend();
  renderProjectLegend();
  renderFillLegend();
  renderBorderLegend();
  renderSizeLegend(graph);
  renderQueries(graph.queries);

  let selectionState = createSelectionState();
  let filterQuery = "";

  const graphApi = renderGraph(graph, {
    // Graph click: the node is already on screen, so no pan — just halo + swap the right panel.
    onNodeClick: (id) => {
      selectionState = selectNode(selectionState, id);
      syncSelectionUI();
    },
    onBackgroundClick: () => {
      selectionState = deselectNode(selectionState);
      syncSelectionUI();
    },
  });

  // Agent-status pulse pause/toggle (FACTORY-975/FACTORY-974's ACCESSIBILITY/CONTROLS item) —
  // restore the persisted preference before wiring the button so a muted session stays muted
  // across a reload, then keep the button's own label/aria-pressed and `renderGraph`'s live
  // classes in sync on every click.
  let animationsEnabled = loadAnimationsEnabled();
  graphApi.setAnimationsEnabled(animationsEnabled);
  const animationToggleButton = document.getElementById("animation-toggle");
  function syncAnimationToggleUI() {
    animationToggleButton.setAttribute("aria-pressed", String(animationsEnabled));
    animationToggleButton.textContent = animationsEnabled ? "Pulses: on" : "Pulses: off";
  }
  syncAnimationToggleUI();
  animationToggleButton.addEventListener("click", () => {
    animationsEnabled = !animationsEnabled;
    graphApi.setAnimationsEnabled(animationsEnabled);
    saveAnimationsEnabled(animationsEnabled);
    syncAnimationToggleUI();
  });

  /** List click (or Enter on a focused row): select AND pan/halo to the node (FACTORY-957 item 4) — the one path that passes `pan: true`. */
  function selectFromList(id) {
    selectionState = selectNode(selectionState, id);
    graphApi.setSelectedId(id, { pan: true });
    renderNodeListView();
    renderRightPanelView();
  }

  /** Graph-click/background-click/close-button path: halo (no pan) then refresh both panels. */
  function syncSelectionUI() {
    graphApi.setSelectedId(selectionState.selectedId);
    renderNodeListView();
    renderRightPanelView();
  }

  function renderNodeListView() {
    renderNodeList(graphApi.getNodes(), selectionState.selectedId, filterQuery);
  }

  function renderRightPanelView() {
    const legendView = document.getElementById("legend-view");
    const infoView = document.getElementById("node-info-view");
    const node = selectionState.selectedId == null ? null : graphApi.getNodeById(selectionState.selectedId);
    if (!node) {
      legendView.hidden = false;
      infoView.hidden = true;
      return;
    }
    document.getElementById("node-info-content").innerHTML = nodeInfoHtml(node, {
      epicCount: isProjectNode(node) ? graphApi.epicCountForProject(node.id) : 0,
    });
    legendView.hidden = true;
    infoView.hidden = false;
  }

  /** Builds the left sidebar's `<li role="option">` rows: sorted + filtered (public/sidebar-list.js), each showing the node's shape icon, fill/border swatches, id ("key"), and label. */
  function renderNodeList(allNodes, selectedId, query) {
    const listEl = document.getElementById("node-list");
    const filtered = filterNodesForSidebar(sortNodesForSidebar(allNodes), query);
    listEl.innerHTML = "";

    if (filtered.length === 0) {
      const empty = document.createElement("li");
      empty.className = "node-list-empty";
      empty.textContent = "No matching nodes.";
      listEl.appendChild(empty);
      return;
    }

    const theme = currentTheme();
    let selectedRow = null;
    for (const node of filtered) {
      const isSelected = node.id === selectedId;
      const fill = isProjectNode(node) ? projectFill(theme) : colorForNode(node, theme);
      const border = isProjectNode(node) ? null : jiraBorderForNode(node, theme);

      const li = document.createElement("li");
      li.className = "node-row";
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(isSelected));
      li.dataset.id = node.id;
      li.tabIndex = isSelected ? 0 : -1;
      li.innerHTML = `${shapeIconSvg(shapeForNode(node))}<span class="swatch" style="background:${fill}"></span>${
        border ? `<span class="border-swatch" style="border-color:${border}"></span>` : ""
      }<span class="node-row-key">${escapeHtml(node.id)}</span><span class="node-row-label">${escapeHtml(node.label)}</span>`;
      li.addEventListener("click", () => selectFromList(node.id));
      listEl.appendChild(li);
      if (isSelected) selectedRow = li;
    }
    // Auto-scroll the selected row into view (FACTORY-957 item 1), without stealing focus from
    // wherever the user currently has it (e.g. mid-typing in the filter box).
    selectedRow?.scrollIntoView({ block: "nearest" });
  }

  document.getElementById("node-filter").addEventListener("input", (event) => {
    filterQuery = event.target.value;
    renderNodeListView();
  });

  document.getElementById("node-info-close").addEventListener("click", () => {
    selectionState = deselectNode(selectionState);
    syncSelectionUI();
  });

  // Keyboard nav (FACTORY-957 item 1: "arrows to move, Enter to select"), a simple roving
  // tabindex: ArrowDown/ArrowUp move focus one row (clamped, no wraparound — chosen default, see
  // the PR description), Enter selects whichever row currently has focus.
  document.getElementById("node-list").addEventListener("keydown", (event) => {
    const items = Array.from(document.querySelectorAll("#node-list .node-row"));
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement);

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = Math.min(items.length - 1, Math.max(0, currentIndex === -1 ? 0 : currentIndex + delta));
      for (const item of items) item.tabIndex = -1;
      items[nextIndex].tabIndex = 0;
      items[nextIndex].focus();
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = items[currentIndex === -1 ? 0 : currentIndex];
      selectFromList(target.dataset.id);
    }
  });

  renderNodeListView();
  renderRightPanelView();

  const intervalMs = Math.max(1, graph.refreshSeconds ?? DEFAULT_REFRESH_SECONDS) * 1000;
  setInterval(async () => {
    try {
      const next = await fetchGraph();
      renderBanner(next);
      renderQueries(next.queries);
      graphApi.apply(next);

      // FACTORY-957 item 2: selection persists across refresh by node id, and clears
      // automatically if the selected node disappeared.
      const presentIds = new Set(graphApi.getNodes().map((n) => n.id));
      const reconciled = reconcileSelection(selectionState, presentIds);
      if (reconciled !== selectionState) {
        selectionState = reconciled;
        graphApi.setSelectedId(null);
      }
      renderNodeListView();
      renderRightPanelView();
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

/** Project -> shape/colour and `contains` -> line-style legend (FACTORY-911 item 4). */
function renderProjectLegend() {
  const el = document.getElementById("project-legend");
  const theme = currentTheme();
  const fill = projectFill(theme);
  const size = 140;
  const path = d3.symbol().type(D3_SYMBOL_BY_SHAPE[SHAPE_PROJECT]).size(size)();
  const shapeSvg = `<svg class="shape-icon" width="18" height="18" viewBox="-10 -10 20 20"><path d="${path}" fill="${fill}" stroke="var(--node-stroke)" stroke-width="1.5"></path></svg>`;
  const lineSvg = `<svg width="28" height="12"><line x1="0" y1="6" x2="28" y2="6" class="edge contains"></line></svg>`;
  el.innerHTML = [
    "<h2>Project</h2>",
    `<div class="legend-row">${shapeSvg}<span>Jira project (fixed shape/colour, no status ring, size never scales)</span></div>`,
    `<div class="legend-row">${lineSvg}<span>contains (project → Epics and Bugs)</span></div>`,
  ].join("");
}

/** Agent status -> fill legend (FACTORY-939, reverting FACTORY-900's inversion; recoloured by FACTORY-944): colors.js's current-theme colours, as a fill swatch. */
function renderFillLegend() {
  const el = document.getElementById("fill-legend");
  const theme = currentTheme();
  const colors = STATUS_COLORS[theme];
  const cannotReport = CANNOT_REPORT_COLOR[theme];
  const rows = ["<h2>Agent status → fill</h2>"];
  for (const [status, hex] of Object.entries(colors)) {
    rows.push(`<div class="legend-row"><span class="swatch" style="background:${hex}"></span><span>${status}</span></div>`);
  }
  rows.push(
    `<div class="legend-row"><span class="swatch dashed" style="background:${cannotReport};border-color:${cannotReport}"></span><span>cannot report status (same neutral as "none" — distinguished by the dashed border, see below)</span></div>`,
  );
  el.innerHTML = rows.join("");
}

/** Jira status -> border legend (FACTORY-939, repurposed from FACTORY-900's fill legend). Shows the CURRENT theme's actual border hexes. */
function renderBorderLegend() {
  const el = document.getElementById("border-legend");
  const borders = JIRA_STATUS_BORDERS[currentTheme()];
  const rows = ["<h2>Jira status → border</h2>"];
  const entries = [
    ["To Do", borders.todo],
    ["Backlog", borders.backlog],
    ["In Progress", borders.inprogress],
    ["In Review", borders.inreview],
    ["Done", borders.done],
    ["non-Jira / no Jira status", borders.neutral],
  ];
  for (const [label, hex] of entries) {
    rows.push(`<div class="legend-row"><span class="border-swatch" style="border-color:${hex}"></span><span>${label}</span></div>`);
  }
  rows.push(
    `<div class="legend-row"><span class="border-swatch dashed"></span><span>dashed border = the provider cannot report agent status (see fill legend above)</span></div>`,
  );
  rows.push(
    `<div class="legend-row"><span class="swatch" style="background:none;border:2px dashed #fab387"></span><span>admission withheld (a second, wider ring overlay, never a fill)</span></div>`,
  );
  rows.push(
    `<div class="legend-row"><span style="width:14px;text-align:center">○</span><span>dot = hit by a query (never a link-discovered or project node); fixed size, never scales with the node</span></div>`,
  );
  el.innerHTML = rows.join("");
}

/** Size legend (FACTORY-913): shows the server's actual SEER_SIZE_EPIC/BUG/STORY/BASE, never hardcoded. */
function renderSizeLegend(graph) {
  const el = document.getElementById("size-legend");
  const { epic, bug, story, base } = sizeConfigFromGraph(graph);
  el.innerHTML = [
    "<h2>Node size</h2>",
    `<div class="legend-row">${shapeIconSvg(SHAPE_HEXAGON)}<span>${epic}x — Epic</span></div>`,
    `<div class="legend-row">${shapeIconSvg("triangle")}<span>${bug}x — Bug</span></div>`,
    `<div class="legend-row">${shapeIconSvg("square")}<span>${story}x — Story</span></div>`,
    `<div class="legend-row"><span>${base}x — base size (Task, Sub-task, other/unknown Jira type, non-Jira)</span></div>`,
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
function renderGraph(initialGraph, { onNodeClick, onBackgroundClick } = {}) {
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
  // The currently-selected node id (FACTORY-957 item 2), owned by `main()`'s selection reducer —
  // mirrored here only so the D3 render loop knows which node to halo. `main()` is the only
  // writer, via the returned `setSelectedId`.
  let selectedNodeId = null;
  // Agent-status pulse toggle (FACTORY-975/FACTORY-974's ACCESSIBILITY/CONTROLS item) — `main()`
  // owns the persisted preference and is the only writer, via the returned `setAnimationsEnabled`,
  // same mirrored-flag pattern as `selectedNodeId` above. Defaults to on; `main()` overrides this
  // from `loadAnimationsEnabled()` before the first paint if a prior session muted pulses.
  let animationsEnabled = true;

  const svg = d3.select("#graph").attr("width", width).attr("height", height);
  const root = svg.append("g");
  const zoomBehavior = d3.zoom().on("zoom", (event) => {
    root.attr("transform", event.transform);
    if (event.sourceEvent) userTransformed = true;
  });
  svg.call(zoomBehavior);
  // Empty-canvas click deselects (FACTORY-957 item 2/spec: "Clicking empty canvas ... deselects
  // and returns to the legend"). `event.target === svg.node()` is true only when the click lands
  // on the SVG background itself — a click on a node's `<g class="node">` (or any shape/text
  // inside it) targets that element, never the outer `<svg>`, so this never fires for a node click
  // (no stopPropagation needed on the node handler above).
  svg.on("click", (event) => {
    if (event.target === svg.node()) onBackgroundClick?.();
  });

  function symbolPathForNode(node) {
    const shape = shapeForNode(node);
    const size = scaledSizeForNode(node, sizeConfig);
    return d3.symbol().type(D3_SYMBOL_BY_SHAPE[shape]).size(size)();
  }

  function approxRadiusForNode(node) {
    return Math.sqrt(scaledSizeForNode(node, sizeConfig) / Math.PI);
  }

  /**
   * The FILL shape's own path — smaller than `symbolPathForNode`'s by `fillInsetForNode` (zero
   * for a project node, which draws no border and needs no gap) so the canvas-coloured
   * `BORDER_GAP_WIDTH`px annulus FACTORY-944 item 3 requires shows through between the fill and
   * the border stroke (drawn separately, at the node's full/un-inset size — see
   * `renderNodeSelection`), rather than the border straddling the fill's own edge with no gap at
   * all. The inset is converted from a target pixel radius to a D3 symbol `size` (area) via the
   * same circle-area approximation `approxRadiusForNode` already uses, floored at 1px of radius
   * so a very small node's fill never vanishes entirely.
   */
  function fillPathForNode(node) {
    const shape = shapeForNode(node);
    const size = scaledSizeForNode(node, sizeConfig);
    const inset = fillInsetForNode(node);
    if (inset <= 0) return d3.symbol().type(D3_SYMBOL_BY_SHAPE[shape]).size(size)();
    const radius = Math.sqrt(size / Math.PI);
    const insetRadius = Math.max(1, radius - inset);
    const insetSize = Math.PI * insetRadius * insetRadius;
    return d3.symbol().type(D3_SYMBOL_BY_SHAPE[shape]).size(insetSize)();
  }

  /** Re-fits the view to the current node positions, unless the user has since panned/zoomed by hand. */
  function fit({ force = false } = {}) {
    if (!shouldFit({ userTransformed, force })) return;
    // `r` here is the two-line label's own bottom extent (FACTORY-970), not just the node's shape
    // radius: it's always the larger of the two (the label sits below the shape), so the fitted
    // bbox now includes line 2's extent instead of only the shape's.
    const points = nodes.map((d) => ({ x: d.x, y: d.y, r: labelBottomExtent(approxRadiusForNode(d)) }));
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

  /**
   * Pans (keeping the CURRENT zoom level) to centre a node selected from the left list
   * (FACTORY-957 item 4) — a distinct helper from `fit()`, not a reuse of it: `fit()` always
   * re-computes a bounding-box scale for every node, which is the wrong shape of transform for
   * "centre on one node without changing zoom". The ticket's actual requirement this exists to
   * satisfy is narrower than sharing code with `fit()` — it is that this must NOT be "another
   * `fit({force: true})`", i.e. it must never reset `userTransformed`. A programmatic
   * `zoomBehavior.transform` call never sets `userTransformed = true` either (only a real gesture,
   * `event.sourceEvent`, does — see the `zoomBehavior.on("zoom", ...)` handler above), so this
   * transform is invisible to that flag either way: a user's prior manual pan/zoom is neither
   * overridden nor newly recorded by selecting from the list.
   */
  function panToSelectedNode(node) {
    if (!node || typeof node.x !== "number" || typeof node.y !== "number") return;
    const k = d3.zoomTransform(svg.node()).k;
    const x = width / 2 - k * node.x;
    const y = height / 2 - k * node.y;
    svg.transition().duration(300).call(zoomBehavior.transform, d3.zoomIdentity.translate(x, y).scale(k));
  }

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

  /** `contains` edges (project -> Epic) use the tighter PROJECT_LINK_DISTANCE so a project's Epics cluster near it, never the general SEER_LINK_DISTANCE every other edge kind uses. */
  function linkDistanceForLink(link) {
    return link.kind === "contains" ? PROJECT_LINK_DISTANCE : layoutConfig.linkDistance;
  }

  const simulation = d3
    .forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((d) => d.id).distance(linkDistanceForLink))
    .force("charge", d3.forceManyBody().strength(-layoutConfig.charge))
    // Centering/gravity (COMPACT LAYOUT item 3): a per-node spring toward the centre, SEER_GRAVITY
    // strength, so disconnected components drift together instead of spreading into empty space.
    .force("x", d3.forceX(width / 2).strength(layoutConfig.gravity))
    .force("y", d3.forceY(height / 2).strength(layoutConfig.gravity))
    // Collision radius follows each node's OWN scaled size (COMPACT LAYOUT item 4) — a function,
    // not the old fixed NODE_RADIUS + 4, so a live-agent node pushes its neighbours away
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

  /**
   * Count of `contains` edges out of a project node whose target is specifically an Epic —
   * FACTORY-911 item 4's "number of Epics" tooltip field. `contains` also reaches non-Done Bugs
   * now (FACTORY-977), so this filters by the target's own `resourceType` rather than just
   * counting every `contains` edge, or a project with Bugs would inflate this "epics" figure.
   */
  function epicCountForProject(projectId) {
    return links.filter((l) => {
      if (l.kind !== "contains") return false;
      const sourceId = typeof l.source === "object" ? l.source.id : l.source;
      if (sourceId !== projectId) return false;
      const targetId = typeof l.target === "object" ? l.target.id : l.target;
      return nodeById.get(targetId)?.resourceType === "Epic";
    }).length;
  }

  // Content is built by `nodeInfoHtml` (public/node-info.js) — a pure function of the datum `d`,
  // the SAME one the right-panel node-info view (wired in `main()`) calls. `showTooltip` itself
  // only ever handles cursor positioning now (FACTORY-957 item 2's required split).
  function showTooltip(event, d) {
    tooltip.innerHTML = nodeInfoHtml(d, { epicCount: isProjectNode(d) ? epicCountForProject(d.id) : 0 });
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
    // Shape carries resource type (FACTORY-876 item 3); fill is agent status, border is Jira
    // status (FACTORY-939, reverting FACTORY-900's inversion) — type is never encoded in hue
    // either way. Three stacked layers draw a node, back to front:
    // - `node-border-gap`: normally painted NOTHING (`stroke: none`) — the canvas-coloured gap
    //   FACTORY-944 item 3 requires between fill and border is left to the canvas itself, simply
    //   by drawing `node-shape`'s fill smaller than the border (see `fillPathForNode`/
    //   `fillInsetForNode`), never by actively painting a gap colour. The one exception is
    //   dark-theme "To Do" (`borderForNode`'s `gapColor`, FACTORY-944 item 1): there, a plain
    //   canvas-coloured gap would be exactly as invisible against the dark canvas as the
    //   near-black border itself, so this layer paints a light hairline instead, wide enough
    //   that it still shows past the narrower `node-border-ring` stroke drawn on top of it.
    // - `node-border-ring`: the actual Jira-status border colour, at the node's full (un-inset)
    //   size.
    // - `node-shape`: the fill (agent-status colour), at a SMALLER size when bordered
    //   (`fillPathForNode`), so the gap above has somewhere to show.
    // Stroke/fill attrs are set per-node below (borderForNode/fillInsetForNode), not here.
    entered.append("path").attr("class", "node-border-gap").attr("fill", "none");
    entered.append("path").attr("class", "node-border-ring").attr("fill", "none");
    entered.append("path").attr("class", "node-shape");
    const enteredLabel = entered.append("text").attr("class", "node-label").attr("text-anchor", "middle");
    // Two `<tspan>`s (FACTORY-970): line 1 is the node's key, line 2 (directly beneath, muted,
    // smaller) is the label with that key stripped — see `node-label.js`'s `splitNodeLabel`.
    // Each carries its own `x="0"` so `text-anchor: middle` re-centres it independently of
    // whatever width the OTHER line's text happens to have — without it, a tspan with no `x`
    // just continues from the first tspan's end-of-text cursor instead of starting a new
    // centred line.
    enteredLabel.append("tspan").attr("class", "node-label-key").attr("x", 0);
    enteredLabel.append("tspan").attr("class", "node-label-name").attr("x", 0);
    entered.on("mouseenter", showTooltip).on("mousemove", showTooltip).on("mouseleave", hideTooltip);
    // Click selects the node (FACTORY-957 item 2's "select ... via graph click") IN ADDITION to
    // the existing click-shows-tooltip behaviour above (hover's own mouseenter/mousemove/
    // mouseleave trio is untouched — "Hover keeps its current tooltip behaviour unchanged").
    entered.on("click", (event, d) => {
      showTooltip(event, d);
      onNodeClick?.(d.id);
    });

    const merged = entered.merge(sel);

    // Re-run on every refresh, not just on enter: a node whose resourceType/jiraStatus/agentStatus
    // (or anything else shape/fill/border-relevant) changed needs its path/size/fill/border/label
    // offset to follow, in place.
    merged.select("path.node-border-gap").attr("d", (d) => symbolPathForNode(d));
    merged.select("path.node-border-ring").attr("d", (d) => symbolPathForNode(d));
    merged
      .select("path.node-shape")
      .attr("d", (d) => (isProjectNode(d) ? symbolPathForNode(d) : fillPathForNode(d)))
      .attr("fill", (d) => (isProjectNode(d) ? projectFill(currentTheme()) : colorForNode(d, currentTheme())))
      .each(function (d) {
        const theme = currentTheme();
        const border = borderForNode(d, theme);
        const g = d3.select(this.parentNode);
        const gapSel = g.select("path.node-border-gap");
        const ringSel = g.select("path.node-border-ring");
        if (border.visible) {
          ringSel
            .attr("stroke", border.stroke)
            .attr("stroke-width", border.width)
            .attr("stroke-dasharray", border.dashed ? "3,2" : null);
          if (border.gapColor) {
            gapSel
              .attr("stroke", border.gapColor)
              .attr("stroke-width", border.width + 2 * BORDER_GAP_WIDTH)
              .attr("stroke-dasharray", border.dashed ? "3,2" : null);
          } else {
            gapSel.attr("stroke", "none");
          }
        } else {
          // No Jira-status border to draw (e.g. a project node) — the shape stays plain, same
          // neutral outline every node used pre-FACTORY-900.
          ringSel.attr("stroke", "var(--node-stroke)").attr("stroke-width", 1.5).attr("stroke-dasharray", null);
          gapSel.attr("stroke", "none");
        }
      });
    merged.each(function (d) {
      const radius = approxRadiusForNode(d);
      const { key, name } = splitNodeLabel(d);
      const label = d3.select(this).select("text.node-label");
      label
        .select("tspan.node-label-key")
        .attr("dy", line1Dy(radius))
        .text(truncateToChars(key, maxCharsForRadius(radius)));
      label
        .select("tspan.node-label-name")
        .attr("dy", LINE_SPACING_PX)
        .text(truncateToChars(name, maxCharsForRadius(radius, LINE2_FONT_SCALE)));
    });

    // The admission ring and the discovery dot are presence-toggled per node, not just styled,
    // since whether a node has one can change between refreshes. Radii are re-derived every pass
    // too, since a node's shape/size can change underneath an existing ring. Insertion order
    // (always before "text") puts the discovery dot on top.
    merged.each(function (d) {
      const g = d3.select(this);
      const radius = approxRadiusForNode(d);

      const hasAdmissionRing = !g.select("circle.admission-ring").empty();
      if (d.admissionWithheld && !hasAdmissionRing) {
        g.insert("circle", "text").attr("class", "admission-ring").attr("r", radius + ADMISSION_RING_GAP);
      } else if (!d.admissionWithheld && hasAdmissionRing) {
        g.select("circle.admission-ring").remove();
      } else if (d.admissionWithheld && hasAdmissionRing) {
        g.select("circle.admission-ring").attr("r", radius + ADMISSION_RING_GAP);
      }

      const hasDot = !g.select("circle.discovery-dot").empty();
      const shouldHaveDot = shouldShowDiscoveryDot(d);
      if (shouldHaveDot && !hasDot) {
        g.insert("circle", "text").attr("class", "discovery-dot").attr("r", DISCOVERY_DOT_RADIUS).attr("fill", "#1e1e2e");
      } else if (!shouldHaveDot && hasDot) {
        g.select("circle.discovery-dot").remove();
      }
    });

    updateSelectionHalo(merged);
    applyPulseClasses(merged);

    return merged;
  }

  /**
   * Toggles the agent-status pulse class (FACTORY-975/FACTORY-974) on whichever element
   * `animationClassFor` targets for this node — `path.node-shape` for "working", both
   * `path.node-border-ring` and `path.node-border-gap` for "stalled"/"blocked" — and sets the
   * node's own deterministic `--pulse-delay` stagger. Takes the already-merged selection (entered
   * AND pre-existing nodes), same pattern as `updateSelectionHalo`, and is called on EVERY render
   * pass so a node's status change on refresh swaps the class in place with no full re-render;
   * `setAnimationsEnabled` below calls it again outside a refresh so the pause toggle restyles
   * immediately. All the actual pulsing is CSS `@keyframes` (style.css) driven by these class
   * names — this function only ever sets/clears classes and one CSS variable, never a per-frame
   * loop.
   */
  function applyPulseClasses(sel) {
    sel.each(function (d) {
      const g = d3.select(this);
      const activeClass = animationsEnabled ? animationClassFor(d) : null;
      g.select("path.node-shape").classed(PULSE_BODY_WORKING, activeClass === PULSE_BODY_WORKING);
      g.select("path.node-border-ring")
        .classed(PULSE_BORDER_STALLED, activeClass === PULSE_BORDER_STALLED)
        .classed(PULSE_BORDER_BLOCKED, activeClass === PULSE_BORDER_BLOCKED);
      g.select("path.node-border-gap")
        .classed(PULSE_BORDER_STALLED, activeClass === PULSE_BORDER_STALLED)
        .classed(PULSE_BORDER_BLOCKED, activeClass === PULSE_BORDER_BLOCKED);
      g.style("--pulse-delay", `${staggerDelayMs(d.id)}ms`);
    });
  }

  /**
   * Presence-toggles the `.selection-halo` ring (FACTORY-957 item 4) on whichever single node
   * matches `selectedNodeId` — same "toggle by presence, re-derive the radius every pass" pattern
   * the admission ring/discovery dot above already use, since both the selected id and a node's
   * own size can change between calls. Takes the already-`merged` selection so a selection change
   * (via `setSelectedId`, outside a full `apply()`) can restyle instantly without re-running the
   * whole `renderNodeSelection` join.
   */
  function updateSelectionHalo(sel) {
    sel.each(function (d) {
      const g = d3.select(this);
      const hasHalo = !g.select("circle.selection-halo").empty();
      const shouldHaveHalo = d.id === selectedNodeId;
      if (shouldHaveHalo && !hasHalo) {
        // Inserted before "text", same as the admission ring/discovery dot above, so the node's
        // own label stays readable on top of the halo rather than the halo painting over it.
        g.insert("circle", "text").attr("class", "selection-halo").attr("r", approxRadiusForNode(d) + ADMISSION_RING_GAP + SELECTION_HALO_GAP);
      } else if (!shouldHaveHalo && hasHalo) {
        g.select("circle.selection-halo").remove();
      } else if (shouldHaveHalo && hasHalo) {
        g.select("circle.selection-halo").attr("r", approxRadiusForNode(d) + ADMISSION_RING_GAP + SELECTION_HALO_GAP);
      }
    });
  }

  function renderEdgeSelection() {
    edgeSel = edgeLayer
      .selectAll("line.edge")
      .data(links, edgeKey)
      .join("line")
      // `contains` (project -> Epic) draws lighter/thinner than a ticket link (style.css's
      // `.edge.contains`), but keeps the same >= 3:1 --edge token, never a second colour.
      .attr("class", (d) => (d.kind === "contains" ? "edge contains" : "edge"))
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
    simulation.force("link").distance(linkDistanceForLink);
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

    // FACTORY-897: re-fit on every apply(), not just when the simulation reheats and later fires
    // "end". A refresh with no nodes/links added/removed never reheats the simulation, but a
    // node's resourceType (and so its scaled size, FACTORY-913) can still change underneath it,
    // so without this a node can grow past the already-fitted viewport and stay there until the
    // user clicks Fit. fit() self-guards on userTransformed, so this never overrides a user's own
    // pan/zoom.
    fit();
  }

  /**
   * Sets which node is haloed (FACTORY-957 item 4) — `main()`'s selection reducer is the only
   * caller, on every select/deselect/reconcile. Restyles the halo immediately via
   * `updateSelectionHalo` (not just on the next `apply()`), and optionally pans to the node
   * (`pan: true`, used only for a LIST-originated selection — a graph click needs no pan, the
   * clicked node is already on screen).
   */
  function setSelectedId(nodeId, { pan = false } = {}) {
    selectedNodeId = nodeId;
    updateSelectionHalo(nodeSel);
    if (pan && nodeId != null) panToSelectedNode(nodeById.get(nodeId));
  }

  /**
   * Sets the agent-status pulse toggle (FACTORY-975/FACTORY-974's pause control) — `main()` is
   * the only caller, on load (from the persisted preference) and on every click of the toggle
   * button. Restyles every existing node immediately via `applyPulseClasses`, same
   * "mirror the flag, restyle now, don't wait for the next apply()" pattern `setSelectedId` above
   * uses for the halo.
   */
  function setAnimationsEnabled(enabled) {
    animationsEnabled = enabled;
    applyPulseClasses(nodeSel);
  }

  apply(initialGraph);
  return {
    apply,
    setSelectedId,
    setAnimationsEnabled,
    getNodes: () => nodes,
    getNodeById: (id) => nodeById.get(id),
    epicCountForProject,
  };
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    "beforeend",
    `<pre style="color:#f38ba8;padding:16px">Failed to load graph: ${err.message}</pre>`,
  );
});
