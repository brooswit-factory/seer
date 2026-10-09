import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { loadSizeConfig, loadLayoutConfig } from "../src/config/env.ts";
import { ConfigError } from "../src/config/loader.ts";

const ENV_KEYS = [
  "SEER_SIZE_BASE",
  "SEER_SIZE_EPIC",
  "SEER_SIZE_BUG",
  "SEER_SIZE_STORY",
  "SEER_SIZE_ACTIVE",
  "SEER_LINK_DISTANCE",
  "SEER_CHARGE",
  "SEER_GRAVITY",
];

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("loadSizeConfig", () => {
  test("defaults to epic=3, bug=3, story=2, base=1.5 when unset (FACTORY-913)", () => {
    expect(loadSizeConfig()).toEqual({ epic: 3, bug: 3, story: 2, base: 1.5 });
  });

  test("reads valid env overrides for every setting", () => {
    process.env.SEER_SIZE_EPIC = "4";
    process.env.SEER_SIZE_BUG = "3.5";
    process.env.SEER_SIZE_STORY = "2.25";
    process.env.SEER_SIZE_BASE = "1.75";
    expect(loadSizeConfig()).toEqual({ epic: 4, bug: 3.5, story: 2.25, base: 1.75 });
  });

  test("accepts a decimal value > 0 (1.5 must pass)", () => {
    process.env.SEER_SIZE_BASE = "1.5";
    expect(loadSizeConfig().base).toBe(1.5);
  });

  test.each(["0", "-1", "not-a-number", ""])("SEER_SIZE_BASE=%s falls back to the default (empty) or throws (invalid)", (raw) => {
    process.env.SEER_SIZE_BASE = raw;
    if (raw === "") {
      expect(loadSizeConfig().base).toBe(1.5);
    } else {
      expect(() => loadSizeConfig()).toThrow(ConfigError);
    }
  });

  test.each(["SEER_SIZE_EPIC", "SEER_SIZE_BUG", "SEER_SIZE_STORY", "SEER_SIZE_BASE"])(
    "rejects a non-positive %s",
    (key) => {
      process.env[key] = "-8";
      expect(() => loadSizeConfig()).toThrow(new RegExp(key));
    },
  );

  test("rejects NaN", () => {
    process.env.SEER_SIZE_EPIC = "NaN";
    expect(() => loadSizeConfig()).toThrow(ConfigError);
  });

  describe("SEER_SIZE_ACTIVE (removed FACTORY-913 setting)", () => {
    let warnSpy: typeof console.warn;
    let warnCalls: unknown[][];

    beforeEach(() => {
      warnCalls = [];
      warnSpy = console.warn;
      console.warn = (...args: unknown[]) => warnCalls.push(args);
    });
    afterEach(() => {
      console.warn = warnSpy;
    });

    test("has no effect on the resolved config, but logs one startup warning when set", () => {
      process.env.SEER_SIZE_ACTIVE = "9.5";
      const config = loadSizeConfig();
      expect(config).toEqual({ epic: 3, bug: 3, story: 2, base: 1.5 });
      expect(warnCalls).toEqual([["SEER_SIZE_ACTIVE is no longer used"]]);
    });

    test("does not warn when unset", () => {
      loadSizeConfig();
      expect(warnCalls).toEqual([]);
    });

    test("does not fail even on a value that would otherwise be invalid", () => {
      process.env.SEER_SIZE_ACTIVE = "not-a-number";
      expect(() => loadSizeConfig()).not.toThrow();
    });
  });
});

describe("loadLayoutConfig", () => {
  test("defaults to a tighter/weaker layout than the pre-FACTORY-890 hardcoded values", () => {
    const config = loadLayoutConfig();
    expect(config).toEqual({ linkDistance: 40, charge: 120, gravity: 0.08 });
    expect(config.linkDistance).toBeLessThan(60); // tighter than the old hardcoded distance(60)
    expect(config.charge).toBeLessThan(180); // weaker than the old hardcoded strength(-180)
  });

  test("reads valid env overrides", () => {
    process.env.SEER_LINK_DISTANCE = "25";
    process.env.SEER_CHARGE = "90";
    process.env.SEER_GRAVITY = "0.15";
    expect(loadLayoutConfig()).toEqual({ linkDistance: 25, charge: 90, gravity: 0.15 });
  });

  test("rejects a zero or negative SEER_GRAVITY", () => {
    process.env.SEER_GRAVITY = "0";
    expect(() => loadLayoutConfig()).toThrow(ConfigError);
    process.env.SEER_GRAVITY = "-0.1";
    expect(() => loadLayoutConfig()).toThrow(ConfigError);
  });

  test("rejects a non-numeric SEER_CHARGE", () => {
    process.env.SEER_CHARGE = "lots";
    expect(() => loadLayoutConfig()).toThrow(ConfigError);
  });
});
