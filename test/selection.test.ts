import { describe, expect, test } from "bun:test";
import { createSelectionState, select, deselect, reconcileSelection, neighboursOf } from "../public/selection.js";

describe("selection reducer (FACTORY-957 item 2)", () => {
  test("starts with nothing selected", () => {
    expect(createSelectionState()).toEqual({ selectedId: null });
  });

  test("select from a graph click and select from a list click are the SAME reducer call", () => {
    const fromGraph = select(createSelectionState(), "jira-work:FACTORY-1");
    const fromList = select(createSelectionState(), "jira-work:FACTORY-1");
    expect(fromGraph).toEqual({ selectedId: "jira-work:FACTORY-1" });
    expect(fromGraph).toEqual(fromList);
  });

  test("select requires a node id", () => {
    expect(() => select(createSelectionState(), null)).toThrow();
  });

  test("selecting a second node replaces the first (no multi-select)", () => {
    let state = select(createSelectionState(), "a");
    state = select(state, "b");
    expect(state.selectedId).toBe("b");
  });

  test("deselect (empty-canvas click or close control) clears selection, from any state", () => {
    const selected = select(createSelectionState(), "a");
    expect(deselect(selected)).toEqual({ selectedId: null });
    expect(deselect(createSelectionState())).toEqual({ selectedId: null });
  });

  describe("reconcileSelection: live refresh", () => {
    test("selection persists across refresh when the node id is still present", () => {
      const state = select(createSelectionState(), "a");
      const reconciled = reconcileSelection(state, new Set(["a", "b", "c"]));
      expect(reconciled).toEqual({ selectedId: "a" });
    });

    test("selection clears automatically when the selected node has disappeared", () => {
      const state = select(createSelectionState(), "a");
      const reconciled = reconcileSelection(state, new Set(["b", "c"]));
      expect(reconciled).toEqual({ selectedId: null });
    });

    test("an already-empty selection stays empty, regardless of present ids", () => {
      const state = createSelectionState();
      expect(reconcileSelection(state, new Set(["a"]))).toBe(state); // same reference: no redundant work
      expect(reconcileSelection(state, new Set())).toBe(state);
    });

    test("an unchanged, still-present selection returns the SAME object reference (cheap no-op check for callers)", () => {
      const state = select(createSelectionState(), "a");
      expect(reconcileSelection(state, new Set(["a"]))).toBe(state);
    });
  });

  describe("neighboursOf (FACTORY-982 item 1)", () => {
    const edges = [
      { source: "a", target: "b" },
      { source: "c", target: "a" },
      { source: "b", target: "c" },
      { source: "x", target: "y" },
    ];

    test("finds neighbours in either edge direction", () => {
      expect(neighboursOf("a", edges)).toEqual(new Set(["b", "c"]));
    });

    test("dedupes a node reachable by more than one edge", () => {
      const parallel = [
        { source: "a", target: "b" },
        { source: "b", target: "a" },
      ];
      expect(neighboursOf("a", parallel)).toEqual(new Set(["b"]));
    });

    test("an isolated or absent node has no neighbours", () => {
      expect(neighboursOf("isolated", edges)).toEqual(new Set());
      expect(neighboursOf("not-in-graph", [])).toEqual(new Set());
    });

    test("never includes the node itself, even for a self-loop edge", () => {
      const withSelfLoop = [...edges, { source: "a", target: "a" }];
      expect(neighboursOf("a", withSelfLoop)).toEqual(new Set(["b", "c"]));
    });

    test("normalizes d3-resolved edges (source/target as node object references, not just string ids)", () => {
      const resolved = [{ source: { id: "a" }, target: { id: "b" } }];
      expect(neighboursOf("a", resolved)).toEqual(new Set(["b"]));
      expect(neighboursOf("b", resolved)).toEqual(new Set(["a"]));
    });
  });
});
