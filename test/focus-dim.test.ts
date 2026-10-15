import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { isNonFocus, isEdgeDimmed } from "../public/focus-dim.js";

// app.js is plain <script type="module">, no DOM test harness in this repo (see
// test/sidebar-panel.test.ts for the existing precedent) — the predicates above are exercised
// headlessly, while this source-level check confirms app.js actually DRIVES them: that
// engageFocus/releaseFocus restyle the `.dimmed` class on both nodes and edges immediately on
// select/deselect, not just on the next full `apply()` render pass (FACTORY-982 review ask).
function readAppJs(): string {
  const path = new URL("../public/app.js", import.meta.url).pathname;
  return readFileSync(path, "utf-8");
}

describe("focus-dim (FACTORY-982 item 3's dim-class predicates)", () => {
  describe("isNonFocus", () => {
    test("nothing is dimmed when there is no selection (empty focusIds)", () => {
      expect(isNonFocus("anything", new Set())).toBe(false);
    });

    test("a focus-group node (selected or neighbour) is never dimmed", () => {
      expect(isNonFocus("a", new Set(["a", "b"]))).toBe(false);
    });

    test("every other node IS dimmed once something is selected", () => {
      expect(isNonFocus("c", new Set(["a", "b"]))).toBe(true);
    });
  });

  describe("isEdgeDimmed", () => {
    // "a" is the selected node, "b" a neighbour (focus group {a, b}) — same shape FACTORY-982
    // AC3 describes: "edges between the selected node and its neighbours stay fully visible".
    const focusIds = new Set(["a", "b"]);
    const selectedId = "a";

    test("nothing is dimmed when there is no selection", () => {
      expect(isEdgeDimmed({ source: "a", target: "c" }, new Set(), null)).toBe(false);
    });

    test("an edge between the selected node and a neighbour stays fully visible", () => {
      expect(isEdgeDimmed({ source: "a", target: "b" }, focusIds, selectedId)).toBe(false);
      expect(isEdgeDimmed({ source: "b", target: "a" }, focusIds, selectedId)).toBe(false);
    });

    test("an edge touching a non-focus node is dimmed", () => {
      expect(isEdgeDimmed({ source: "a", target: "c" }, focusIds, selectedId)).toBe(true);
      expect(isEdgeDimmed({ source: "c", target: "d" }, focusIds, selectedId)).toBe(true);
    });

    test("FACTORY-982 AC3 regression: a neighbour<->neighbour edge NOT touching the selected node dims too — triangle A-B, A-C, B-C with A selected must dim B-C", () => {
      const triangleFocusIds = new Set(["a", "b", "c"]); // A selected, B and C both its neighbours
      expect(isEdgeDimmed({ source: "a", target: "b" }, triangleFocusIds, "a")).toBe(false);
      expect(isEdgeDimmed({ source: "a", target: "c" }, triangleFocusIds, "a")).toBe(false);
      expect(isEdgeDimmed({ source: "b", target: "c" }, triangleFocusIds, "a")).toBe(true);
    });

    test("normalizes d3-resolved edges (source/target as node object references)", () => {
      expect(isEdgeDimmed({ source: { id: "a" }, target: { id: "b" } }, focusIds, selectedId)).toBe(false);
      expect(isEdgeDimmed({ source: { id: "a" }, target: { id: "c" } }, focusIds, selectedId)).toBe(true);
    });
  });
});

describe("app.js wires the .dimmed class toggle to select/deselect, not just the next apply()", () => {
  const appJs = readAppJs();

  test("updateFocusDimClasses/updateFocusEdgeDimClasses use the pure predicates via sel.classed(\"dimmed\", ...)", () => {
    expect(appJs).toMatch(/function updateFocusDimClasses\(sel\)\s*\{\s*sel\.classed\("dimmed",\s*\(d\)\s*=>\s*isNonFocus\(d\.id,\s*focusIds\)\)/);
    expect(appJs).toMatch(/function updateFocusEdgeDimClasses\(sel\)\s*\{\s*sel\.classed\("dimmed",\s*\(d\)\s*=>\s*isEdgeDimmed\(d,\s*focusIds,\s*selectedNodeId\)\)/);
  });

  test("engageFocus (on select) calls both dim-class updaters on the live node/edge selections, not just the next apply()", () => {
    const body = appJs.slice(appJs.indexOf("function engageFocus("), appJs.indexOf("function releaseFocus("));
    expect(body).toMatch(/updateFocusDimClasses\(nodeSel\)/);
    expect(body).toMatch(/updateFocusEdgeDimClasses\(edgeSel\)/);
  });

  test("releaseFocus (on deselect) calls both dim-class updaters too, so a cleared focusIds set restores full opacity immediately", () => {
    const start = appJs.indexOf("function releaseFocus(");
    const body = appJs.slice(start, appJs.indexOf("function reheatFocusSimulation("));
    expect(body).toMatch(/updateFocusDimClasses\(nodeSel\)/);
    expect(body).toMatch(/updateFocusEdgeDimClasses\(edgeSel\)/);
    // And it actually clears the focus group before restyling, so isNonFocus/isEdgeDimmed see an
    // empty set and dim nothing (full opacity) rather than reusing the outgoing selection's ids.
    expect(body).toMatch(/focusIds\s*=\s*new Set\(\)/);
  });

  test("both updaters also run on every full render pass (renderNodeSelection/renderEdgeSelection), so a refresh keeps the current focus styling instead of only reacting to select/deselect", () => {
    expect(appJs).toMatch(/updateFocusDimClasses\(merged\)/);
    expect(appJs).toMatch(/updateFocusEdgeDimClasses\(edgeSel\)/);
  });
});
