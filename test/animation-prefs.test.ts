import { describe, expect, test } from "bun:test";
import { ANIMATIONS_STORAGE_KEY, loadAnimationsEnabled, saveAnimationsEnabled } from "../public/animation-prefs.js";

/** A minimal in-memory Storage stand-in, so these tests never touch the real global localStorage. */
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    _map: map,
  };
}

/** A Storage-shaped object where every call throws — the "unavailable" case (private browsing, quota, etc.) the ticket requires degrading gracefully from. */
function throwingStorage() {
  return {
    getItem() {
      throw new Error("storage unavailable");
    },
    setItem() {
      throw new Error("storage unavailable");
    },
  };
}

describe("loadAnimationsEnabled", () => {
  test("defaults to enabled when nothing has been persisted yet", () => {
    expect(loadAnimationsEnabled(fakeStorage())).toBe(true);
  });

  test("reads back a persisted 'false'", () => {
    expect(loadAnimationsEnabled(fakeStorage({ [ANIMATIONS_STORAGE_KEY]: "false" }))).toBe(false);
  });

  test("reads back a persisted 'true'", () => {
    expect(loadAnimationsEnabled(fakeStorage({ [ANIMATIONS_STORAGE_KEY]: "true" }))).toBe(true);
  });

  test("degrades to the enabled default when storage throws, never throws itself", () => {
    expect(() => loadAnimationsEnabled(throwingStorage())).not.toThrow();
    expect(loadAnimationsEnabled(throwingStorage())).toBe(true);
  });

  test("degrades to the enabled default when storage is null/undefined", () => {
    expect(loadAnimationsEnabled(null)).toBe(true);
    expect(loadAnimationsEnabled(undefined)).toBe(true);
  });
});

describe("saveAnimationsEnabled", () => {
  test("persists the toggle so a later load sees it", () => {
    const storage = fakeStorage();
    saveAnimationsEnabled(false, storage);
    expect(loadAnimationsEnabled(storage)).toBe(false);

    saveAnimationsEnabled(true, storage);
    expect(loadAnimationsEnabled(storage)).toBe(true);
  });

  test("never throws when storage throws — the toggle still works in-memory for the session, it just won't survive a reload", () => {
    expect(() => saveAnimationsEnabled(false, throwingStorage())).not.toThrow();
  });

  test("never throws when storage is null/undefined", () => {
    expect(() => saveAnimationsEnabled(false, null)).not.toThrow();
    expect(() => saveAnimationsEnabled(true, undefined)).not.toThrow();
  });
});
