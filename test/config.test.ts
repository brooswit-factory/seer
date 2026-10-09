import { describe, expect, test } from "bun:test";
import { parseConfig, loadConfig, ConfigError } from "../src/config/loader.ts";

const validConfig = {
  sources: [
    {
      id: "u1@machine1",
      machine: "machine1",
      user: "u1",
      displayName: "User One @ machine1",
      queries: [{ provider: "jira-work", query: 'assignee = "u1-account-id"' }],
    },
  ],
  linkDepth: 2,
  port: 4000,
};

describe("parseConfig", () => {
  test("accepts a valid config", () => {
    const config = parseConfig(validConfig);
    expect(config.sources).toHaveLength(1);
    expect(config.linkDepth).toBe(2);
    expect(config.port).toBe(4000);
  });

  test("defaults linkDepth to 1 when omitted", () => {
    const { linkDepth, ...rest } = validConfig;
    const config = parseConfig(rest);
    expect(config.linkDepth).toBe(1);
  });

  test("defaults resultCap to 50 when omitted", () => {
    const config = parseConfig(validConfig);
    expect(config.resultCap).toBe(50);
  });

  test("accepts an explicit resultCap", () => {
    const config = parseConfig({ ...validConfig, resultCap: 10 });
    expect(config.resultCap).toBe(10);
  });

  test("rejects a config missing sources", () => {
    expect(() => parseConfig({ port: 4000 })).toThrow(ConfigError);
    try {
      parseConfig({ port: 4000 });
      throw new Error("expected parseConfig to throw");
    } catch (error) {
      expect((error as Error).message).toContain("sources");
    }
  });

  test("rejects a malformed query missing its provider field", () => {
    const bad = {
      ...validConfig,
      sources: [
        {
          id: "u1@machine1",
          machine: "machine1",
          user: "u1",
          displayName: "User One @ machine1",
          queries: [{ query: "no provider" }],
        },
      ],
    };
    try {
      parseConfig(bad);
      throw new Error("expected parseConfig to throw");
    } catch (error) {
      expect((error as Error).message).toContain("provider");
    }
  });

  test("rejects a source missing its machine field", () => {
    const bad = {
      ...validConfig,
      sources: [{ id: "u1@machine1", user: "u1", displayName: "User One", queries: validConfig.sources[0]?.queries }],
    };
    try {
      parseConfig(bad);
      throw new Error("expected parseConfig to throw");
    } catch (error) {
      expect((error as Error).message).toContain("machine");
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

  test("rejects duplicate source ids", () => {
    const bad = {
      ...validConfig,
      sources: [
        { id: "dup", machine: "m", user: "a", displayName: "A", queries: [{ provider: "jira-work", query: "x" }] },
        { id: "dup", machine: "m", user: "b", displayName: "B", queries: [{ provider: "jira-work", query: "y" }] },
      ],
    };
    try {
      parseConfig(bad);
      throw new Error("expected parseConfig to throw");
    } catch (error) {
      expect((error as Error).message).toContain("duplicate source id");
    }
  });

  test("refuses a query containing currentUser()", () => {
    const bad = {
      ...validConfig,
      sources: [
        {
          id: "u1@machine1",
          machine: "machine1",
          user: "u1",
          displayName: "User One @ machine1",
          queries: [{ provider: "jira-work", query: "assignee = currentUser()" }],
        },
      ],
    };
    try {
      parseConfig(bad);
      throw new Error("expected parseConfig to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as Error).message).toContain("currentUser()");
      expect((error as Error).message).toContain("sources.0.queries.0.query");
    }
  });

  test("refuses currentUser() case-insensitively and with whitespace before the parens", () => {
    const bad = {
      ...validConfig,
      sources: [
        {
          id: "u1@machine1",
          machine: "machine1",
          user: "u1",
          displayName: "User One @ machine1",
          queries: [{ provider: "jira-work", query: "assignee = CURRENTUSER  ()" }],
        },
      ],
    };
    expect(() => parseConfig(bad)).toThrow(ConfigError);
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
    expect(config.sources.length).toBeGreaterThanOrEqual(2);
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
