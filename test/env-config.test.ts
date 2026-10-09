import { afterEach, describe, expect, test } from "bun:test";
import { loadSizeConfig, loadLayoutConfig } from "../src/config/env.ts";
import { ConfigError } from "../src/config/loader.ts";

const ENV_KEYS = ["SEER_SIZE_BASE", "SEER_SIZE_ACTIVE", "SEER_LINK_DISTANCE", "SEER_CHARGE", "SEER_GRAVITY"];

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("loadSizeConfig", () => {
  test("defaults to base=2, active=8 when unset", () => {
    expect(loadSizeConfig()).toEqual({ base: 2, active: 8 });
  });

  test("reads valid env overrides", () => {
    process.env.SEER_SIZE_BASE = "3";
    process.env.SEER_SIZE_ACTIVE = "9.5";
    expect(loadSizeConfig()).toEqual({ base: 3, active: 9.5 });
  });

  test.each(["0", "-1", "not-a-number", ""])("SEER_SIZE_BASE=%s falls back to the default (empty) or throws (invalid)", (raw) => {
    process.env.SEER_SIZE_BASE = raw;
    if (raw === "") {
      expect(loadSizeConfig().base).toBe(2);
    } else {
      expect(() => loadSizeConfig()).toThrow(ConfigError);
    }
  });

  test("rejects a non-positive SEER_SIZE_ACTIVE", () => {
    process.env.SEER_SIZE_ACTIVE = "-8";
    expect(() => loadSizeConfig()).toThrow(/SEER_SIZE_ACTIVE/);
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
