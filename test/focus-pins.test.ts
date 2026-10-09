import { describe, expect, test } from "bun:test";
import { createPinTracker, pinForSelection, releaseSelectionPins, promoteToUserPin } from "../public/focus-pins.js";

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
});
