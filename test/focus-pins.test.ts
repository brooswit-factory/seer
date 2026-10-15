import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createPinTracker, pinForSelection, releaseSelectionPins, promoteToUserPin, reconcileFocusPins } from "../public/focus-pins.js";

function readAppJs(): string {
  const path = new URL("../public/app.js", import.meta.url).pathname;
  return readFileSync(path, "utf-8");
}

describe("focus-pins (FACTORY-982 item 2's pin/unpin bookkeeping)", () => {
  test("starts with nothing pinned", () => {
    expect(createPinTracker()).toEqual({ selectionPinned: new Set(), userPinned: new Set() });
  });

  test("pinForSelection marks the given ids as selection-pinned", () => {
    const tracker = pinForSelection(createPinTracker(), new Set(["a", "b"]));
    expect(tracker.selectionPinned).toEqual(new Set(["a", "b"]));
    expect(tracker.userPinned).toEqual(new Set());
  });

  test("releaseSelectionPins clears ONLY selection-pinned ids, a user-pinned id is never released by deselect", () => {
    let tracker = createPinTracker();
    tracker = { selectionPinned: tracker.selectionPinned, userPinned: new Set(["user-pinned"]) };
    tracker = pinForSelection(tracker, new Set(["a", "b"]));

    const { released, tracker: afterRelease } = releaseSelectionPins(tracker);
    expect(released).toEqual(new Set(["a", "b"]));
    expect(afterRelease.selectionPinned).toEqual(new Set());
    expect(afterRelease.userPinned).toEqual(new Set(["user-pinned"]));
  });

  test("pinForSelection never re-pins an already user-pinned id as selection-pinned (a user pin always wins)", () => {
    let tracker = createPinTracker();
    tracker = promoteToUserPin(tracker, "already-user-pinned");
    tracker = pinForSelection(tracker, new Set(["already-user-pinned", "fresh"]));
    expect(tracker.selectionPinned).toEqual(new Set(["fresh"]));
    expect(tracker.userPinned).toEqual(new Set(["already-user-pinned"]));

    // So a later release never touches it.
    const { released } = releaseSelectionPins(tracker);
    expect(released.has("already-user-pinned")).toBe(false);
  });

  test("promoteToUserPin moves a selection-pinned id to user-pinned (drag promotion)", () => {
    let tracker = pinForSelection(createPinTracker(), new Set(["a"]));
    tracker = promoteToUserPin(tracker, "a");
    expect(tracker.selectionPinned.has("a")).toBe(false);
    expect(tracker.userPinned.has("a")).toBe(true);
  });

  test("every function returns a NEW tracker value, never mutates its argument", () => {
    const tracker = createPinTracker();
    const next = pinForSelection(tracker, new Set(["a"]));
    expect(next).not.toBe(tracker);
    expect(tracker.selectionPinned.size).toBe(0);
  });

  describe("reconcileFocusPins (FACTORY-983 review fix: topology refresh while a selection is still active)", () => {
    test("a newly-added neighbour (e.g. a fresh edge to the selected node) gets pinned, added reports it", () => {
      const tracker = pinForSelection(createPinTracker(), new Set(["a", "b"]));
      const { tracker: next, added, released } = reconcileFocusPins(tracker, new Set(["a", "b"]), new Set(["a", "b", "d"]));
      expect(added).toEqual(["d"]);
      expect(released.size).toBe(0);
      expect(next.selectionPinned).toEqual(new Set(["a", "b", "d"]));
    });

    test("a neighbour removed by a topology change (edge deleted) gets released, released reports it — unaffected ids are left alone", () => {
      const tracker = pinForSelection(createPinTracker(), new Set(["a", "b"]));
      const { tracker: next, added, released } = reconcileFocusPins(tracker, new Set(["a", "b"]), new Set(["a"]));
      expect(added).toEqual([]);
      expect(released).toEqual(new Set(["b"]));
      expect(next.selectionPinned).toEqual(new Set(["a"]));
    });

    test("add and remove together (one edge added, another removed in the same refresh)", () => {
      const tracker = pinForSelection(createPinTracker(), new Set(["a", "b"]));
      const { tracker: next, added, released } = reconcileFocusPins(tracker, new Set(["a", "b"]), new Set(["a", "d"]));
      expect(added).toEqual(["d"]);
      expect(released).toEqual(new Set(["b"]));
      expect(next.selectionPinned).toEqual(new Set(["a", "d"]));
    });

    test("a real user drag-pin on a removed neighbour is preserved (never released) and never reported as released", () => {
      let tracker = pinForSelection(createPinTracker(), new Set(["a", "b"]));
      tracker = promoteToUserPin(tracker, "b"); // user dragged the neighbour before the edge was removed
      const { tracker: next, released } = reconcileFocusPins(tracker, new Set(["a", "b"]), new Set(["a"]));
      expect(released.has("b")).toBe(false);
      expect(next.userPinned.has("b")).toBe(true);
      expect(next.selectionPinned.has("b")).toBe(false); // was never selection-pinned to begin with
    });

    test("an id present in both the previous and new focus group is untouched (no needless re-pin/churn)", () => {
      const tracker = pinForSelection(createPinTracker(), new Set(["a", "b"]));
      const { added, released } = reconcileFocusPins(tracker, new Set(["a", "b"]), new Set(["a", "b"]));
      expect(added).toEqual([]);
      expect(released.size).toBe(0);
    });

    test("never mutates its tracker argument", () => {
      const tracker = pinForSelection(createPinTracker(), new Set(["a", "b"]));
      reconcileFocusPins(tracker, new Set(["a", "b"]), new Set(["a", "d"]));
      expect(tracker.selectionPinned).toEqual(new Set(["a", "b"]));
    });
  });
});

describe("app.js wires reconcileFocusPins into apply()'s topology refresh (FACTORY-983 review fix)", () => {
  const appJs = readAppJs();

  test("apply() calls reconcileFocusSelection after links are rebuilt from the incoming graph, before the simulation picks them up", () => {
    const applyBody = appJs.slice(appJs.indexOf("function apply("), appJs.indexOf("function setSelectedId("));
    const linksIdx = applyBody.indexOf("links = incomingLinks.map(");
    const reconcileIdx = applyBody.indexOf("reconcileFocusSelection()");
    const simNodesIdx = applyBody.indexOf("simulation.nodes(nodes)");
    expect(linksIdx).toBeGreaterThan(-1);
    expect(reconcileIdx).toBeGreaterThan(linksIdx);
    expect(simNodesIdx).toBeGreaterThan(reconcileIdx);
  });

  test("reconcileFocusSelection recomputes the focus group from the fresh links via neighboursOf and hands the delta to reconcileFocusPins", () => {
    const body = appJs.slice(appJs.indexOf("function reconcileFocusSelection("), appJs.indexOf("function engageFocus("));
    expect(body).toMatch(/neighboursOf\(selectedNodeId,\s*links\)/);
    expect(body).toMatch(/reconcileFocusPins\(pinTracker,\s*focusIds,\s*newFocusIds\)/);
  });

  test("reconcileFocusSelection is a no-op when nothing is selected, or the selected node itself didn't survive the refresh", () => {
    const body = appJs.slice(appJs.indexOf("function reconcileFocusSelection("), appJs.indexOf("function engageFocus("));
    expect(body).toMatch(/if \(selectedNodeId == null \|\| !nodeById\.has\(selectedNodeId\)\) return;/);
  });

  test("added focus ids get pinned (fx/fy set) and released ids get un-pinned (fx/fy cleared), same mutation shape engageFocus/releaseFocus already use", () => {
    const body = appJs.slice(appJs.indexOf("function reconcileFocusSelection("), appJs.indexOf("function engageFocus("));
    expect(body).toMatch(/for \(const id of added\)[\s\S]*?n\.fx = n\.x;[\s\S]*?n\.fy = n\.y;/);
    expect(body).toMatch(/for \(const id of released\)[\s\S]*?n\.fx = null;[\s\S]*?n\.fy = null;/);
  });
});
