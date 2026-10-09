import { afterEach, describe, expect, test } from "bun:test";
import { startServer } from "../src/server/serve.ts";
import { GraphCache } from "../src/server/graph-cache.ts";
import type { Graph } from "../src/graph/schema.ts";

function graph(overrides: Partial<Graph> = {}): Graph {
  return {
    schemaVersion: 1,
    snapshotTimestamp: "2026-01-01T00:00:00Z",
    nodes: [],
    edges: [],
    queries: [],
    ...overrides,
  };
}

let server: ReturnType<typeof startServer> | undefined;

afterEach(() => {
  server?.stop(true);
  server = undefined;
});

describe("startServer /graph.json", () => {
  test("binds loopback-only and serves the live graph cache's output", async () => {
    const graphCache = new GraphCache({
      collect: async () => graph({ snapshotTimestamp: "2026-07-01T00:00:00Z" }),
      refreshSeconds: 30,
      fixtureGraph: graph(),
      sanitizeError: (e) => String(e),
    });
    server = startServer({ port: 0, graphCache, openInBrowser: false });

    expect(server.hostname).toBe("127.0.0.1");

    const res = await fetch(`http://127.0.0.1:${server.port}/graph.json`);
    const body = (await res.json()) as Graph;

    expect(res.ok).toBe(true);
    expect(body.snapshotTimestamp).toBe("2026-07-01T00:00:00Z");
    expect(body.stale).toBe(false);
  });

  test("a credential leaked into a collection failure never reaches the HTTP response body", async () => {
    const SECRET = "jira-api-token-should-never-leak";
    const graphCache = new GraphCache({
      collect: async () => {
        throw new Error(`Jira search failed: ...${SECRET}...`);
      },
      refreshSeconds: 30,
      fixtureGraph: graph(),
      sanitizeError: (cause) => (cause instanceof Error ? cause.message.split(SECRET).join("[redacted]") : String(cause)),
    });
    server = startServer({ port: 0, graphCache, openInBrowser: false });

    const res = await fetch(`http://127.0.0.1:${server.port}/graph.json`);
    const bodyText = await res.text();

    expect(bodyText).not.toContain(SECRET);
    expect(JSON.parse(bodyText).usingFixture).toBe(true);
  });
});
