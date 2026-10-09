import { describe, expect, test } from "bun:test";
import { isNonFocus, isEdgeDimmed } from "../public/focus-dim.js";

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
    const focusIds = new Set(["a", "b"]);

    test("nothing is dimmed when there is no selection", () => {
      expect(isEdgeDimmed({ source: "a", target: "c" }, new Set())).toBe(false);
    });

    test("an edge between two focus-group nodes stays fully visible", () => {
      expect(isEdgeDimmed({ source: "a", target: "b" }, focusIds)).toBe(false);
    });

    test("an edge touching a non-focus node is dimmed", () => {
      expect(isEdgeDimmed({ source: "a", target: "c" }, focusIds)).toBe(true);
      expect(isEdgeDimmed({ source: "c", target: "d" }, focusIds)).toBe(true);
    });

    test("normalizes d3-resolved edges (source/target as node object references)", () => {
      expect(isEdgeDimmed({ source: { id: "a" }, target: { id: "b" } }, focusIds)).toBe(false);
      expect(isEdgeDimmed({ source: { id: "a" }, target: { id: "c" } }, focusIds)).toBe(true);
    });
  });
});
