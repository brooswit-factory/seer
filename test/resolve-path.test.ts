import { describe, expect, test } from "bun:test";
import { resolveConfigPath, stripConfigFlag } from "../src/config/resolve-path.ts";

const DEFAULT_PATH = "/default/fixture.json";

describe("resolveConfigPath", () => {
  test("falls back to the default when nothing else is given", () => {
    const resolved = resolveConfigPath({ args: [], env: {}, defaultPath: DEFAULT_PATH });
    expect(resolved).toEqual({ path: DEFAULT_PATH, explicit: false, source: "default" });
  });

  test("a positional path wins over the default", () => {
    const resolved = resolveConfigPath({
      args: [],
      env: {},
      positional: "/positional.json",
      defaultPath: DEFAULT_PATH,
    });
    expect(resolved).toEqual({ path: "/positional.json", explicit: true, source: "positional" });
  });

  test("SEER_CONFIG env wins over a positional path", () => {
    const resolved = resolveConfigPath({
      args: [],
      env: { SEER_CONFIG: "/env.json" },
      positional: "/positional.json",
      defaultPath: DEFAULT_PATH,
    });
    expect(resolved).toEqual({ path: "/env.json", explicit: true, source: "env" });
  });

  test("--config <path> wins over SEER_CONFIG env", () => {
    const resolved = resolveConfigPath({
      args: ["--config", "/flag.json"],
      env: { SEER_CONFIG: "/env.json" },
      positional: "/positional.json",
      defaultPath: DEFAULT_PATH,
    });
    expect(resolved).toEqual({ path: "/flag.json", explicit: true, source: "flag" });
  });

  test("--config=<path> form is also recognized", () => {
    const resolved = resolveConfigPath({ args: ["--config=/flag-eq.json"], env: {}, defaultPath: DEFAULT_PATH });
    expect(resolved).toEqual({ path: "/flag-eq.json", explicit: true, source: "flag" });
  });

  test("an empty SEER_CONFIG value is treated as unset", () => {
    const resolved = resolveConfigPath({ args: [], env: { SEER_CONFIG: "" }, defaultPath: DEFAULT_PATH });
    expect(resolved).toEqual({ path: DEFAULT_PATH, explicit: false, source: "default" });
  });
});

describe("stripConfigFlag", () => {
  test("removes a --config <path> pair", () => {
    expect(stripConfigFlag(["collect", "--config", "/c.json", "extra"])).toEqual(["collect", "extra"]);
  });

  test("removes a --config=<path> token", () => {
    expect(stripConfigFlag(["collect", "--config=/c.json", "extra"])).toEqual(["collect", "extra"]);
  });

  test("leaves args with no --config flag untouched", () => {
    expect(stripConfigFlag(["collect", "/positional.json"])).toEqual(["collect", "/positional.json"]);
  });
});
