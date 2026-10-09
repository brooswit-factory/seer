import { describe, expect, test } from "bun:test";
import { parseConfig, loadConfig, ConfigError } from "../src/config/loader.ts";

const validConfig = {
  users: [
    { id: "u1", displayName: "User One", queries: [{ provider: "jira-work", query: "assignee = currentUser()" }] },
  ],
  linkDepth: 2,
  refreshIntervalSeconds: 30,
  port: 4000,
};

describe("parseConfig", () => {
  test("accepts a valid config", () => {
    const config = parseConfig(validConfig);
    expect(config.users).toHaveLength(1);
    expect(config.linkDepth).toBe(2);
    expect(config.refreshIntervalSeconds).toBe(30);
    expect(config.port).toBe(4000);
  });

  test("defaults linkDepth to 1 when omitted", () => {
    const { linkDepth, ...rest } = validConfig;
    const config = parseConfig(rest);
    expect(config.linkDepth).toBe(1);
  });

  test("defaults refreshIntervalSeconds to 60 when omitted", () => {
    const { refreshIntervalSeconds, ...rest } = validConfig;
    const config = parseConfig(rest);
    expect(config.refreshIntervalSeconds).toBe(60);
  });

  test("rejects a config missing users", () => {
    expect(() => parseConfig({ port: 4000 })).toThrow(ConfigError);
    try {
      parseConfig({ port: 4000 });
      throw new Error("expected parseConfig to throw");
    } catch (error) {
      expect((error as Error).message).toContain("users");
    }
  });

  test("rejects a malformed query missing its provider field", () => {
    const bad = {
      ...validConfig,
      users: [{ id: "u1", displayName: "User One", queries: [{ query: "no provider" }] }],
    };
    try {
      parseConfig(bad);
      throw new Error("expected parseConfig to throw");
    } catch (error) {
      expect((error as Error).message).toContain("provider");
    }
  });

  test("rejects a port out of range", () => {
    const bad = { ...validConfig, port: 70000 };
    try {
      parseConfig(bad);
      throw new Error("expected parseConfig to throw");
    } catch (error) {
      expect((error as Error).message).toContain("port");
    }
  });

  test("rejects duplicate user ids", () => {
    const bad = {
      ...validConfig,
      users: [
        { id: "dup", displayName: "A", queries: [{ provider: "jira-work", query: "x" }] },
        { id: "dup", displayName: "B", queries: [{ provider: "jira-work", query: "y" }] },
      ],
    };
    try {
      parseConfig(bad);
      throw new Error("expected parseConfig to throw");
    } catch (error) {
      expect((error as Error).message).toContain("duplicate user id");
    }
  });

  test("never throws a raw stack trace for malformed input", () => {
    try {
      parseConfig({ not: "a config" });
      throw new Error("expected parseConfig to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as Error).stack).toBeDefined();
      expect((error as Error).message).not.toContain("at Object.");
    }
  });
});

describe("loadConfig", () => {
  test("parses the committed example config fixture", () => {
    const config = loadConfig(new URL("../fixtures/seer.config.example.json", import.meta.url).pathname);
    expect(config.users.length).toBeGreaterThanOrEqual(2);
    expect(config.port).toBeGreaterThan(0);
  });

  test("raises a ConfigError naming the path for a missing file", () => {
    try {
      loadConfig("/nonexistent/seer.config.json");
      throw new Error("expected loadConfig to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as Error).message).toContain("/nonexistent/seer.config.json");
    }
  });
});
