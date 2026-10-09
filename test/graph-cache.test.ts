import { describe, expect, test } from "bun:test";
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

const FIXTURE = graph({ snapshotTimestamp: "2020-01-01T00:00:00Z" });

function clock(startMs = 0) {
  let now = startMs;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("GraphCache", () => {
  test("fresh fetch: a successful collect is served with stale:false and no error", async () => {
    const cache = new GraphCache({
      collect: async () => graph({ snapshotTimestamp: "2026-05-01T00:00:00Z" }),
      refreshSeconds: 30,
      fixtureGraph: FIXTURE,
      sanitizeError: (e) => String(e),
    });

    const result = await cache.getGraph();

    expect(result.stale).toBe(false);
    expect(result.error).toBeNull();
    expect(result.usingFixture).toBe(false);
    expect(result.snapshotTimestamp).toBe("2026-05-01T00:00:00Z");
    expect(result.refreshSeconds).toBe(30);
  });

  test("Jira error after a good collection falls back to the last good snapshot, marked stale with staleSince and a sanitised error", async () => {
    const c = clock();
    let shouldFail = false;
    const cache = new GraphCache({
      collect: async () => {
        if (shouldFail) throw new Error("boom: credential-xyz");
        return graph({ snapshotTimestamp: "2026-05-01T00:00:00Z" });
      },
      refreshSeconds: 15, // minimum TTL, so the test can advance past it quickly
      fixtureGraph: FIXTURE,
      sanitizeError: (e) => (e instanceof Error ? e.message.replace("credential-xyz", "[redacted]") : String(e)),
      now: c.now,
    });

    const first = await cache.getGraph();
    expect(first.stale).toBe(false);

    c.advance(15_000 + 1); // past TTL
    shouldFail = true;
    const second = await cache.getGraph();

    expect(second.stale).toBe(true);
    expect(second.staleSince).not.toBeNull();
    expect(second.error).toBe("boom: [redacted]");
    expect(second.usingFixture).toBe(false);
    expect(second.snapshotTimestamp).toBe("2026-05-01T00:00:00Z"); // still the last GOOD data
  });

  test("Jira error with no prior successful collection falls back to the fixture, marked usingFixture", async () => {
    const cache = new GraphCache({
      collect: async () => {
        throw new Error("no credentials");
      },
      refreshSeconds: 30,
      fixtureGraph: FIXTURE,
      sanitizeError: (e) => String(e),
    });

    const result = await cache.getGraph();

    expect(result.stale).toBe(true);
    expect(result.usingFixture).toBe(true);
    expect(result.staleSince).toBeNull();
    expect(result.snapshotTimestamp).toBe(FIXTURE.snapshotTimestamp);
  });

  test("TTL honoured: a second call within refreshSeconds does not trigger another collect()", async () => {
    const c = clock();
    const cache = new GraphCache({
      collect: async () => graph(),
      refreshSeconds: 30,
      fixtureGraph: FIXTURE,
      sanitizeError: (e) => String(e),
      now: c.now,
    });

    await cache.getGraph();
    c.advance(5_000); // well within the 30s TTL
    await cache.getGraph();

    expect(cache.collectCount).toBe(1);
  });

  test("TTL expiry triggers exactly one new collect() on the next call", async () => {
    const c = clock();
    const cache = new GraphCache({
      collect: async () => graph(),
      refreshSeconds: 15,
      fixtureGraph: FIXTURE,
      sanitizeError: (e) => String(e),
      now: c.now,
    });

    await cache.getGraph();
    c.advance(15_001);
    await cache.getGraph();

    expect(cache.collectCount).toBe(2);
  });

  test("single-flight: N concurrent requests during an in-progress collection share ONE collector run", async () => {
    let resolveCollect: (g: Graph) => void = () => {};
    const cache = new GraphCache({
      collect: () => new Promise<Graph>((resolve) => (resolveCollect = resolve)),
      refreshSeconds: 30,
      fixtureGraph: FIXTURE,
      sanitizeError: (e) => String(e),
    });

    const requests = [cache.getGraph(), cache.getGraph(), cache.getGraph(), cache.getGraph(), cache.getGraph()];
    resolveCollect(graph({ snapshotTimestamp: "2026-06-01T00:00:00Z" }));
    const results = await Promise.all(requests);

    expect(cache.collectCount).toBe(1);
    expect(results.every((r) => r.snapshotTimestamp === "2026-06-01T00:00:00Z")).toBe(true);
  });

  test("credentials never appear in the served response body (serialised JSON), fresh or stale", async () => {
    const SECRET = "sk-super-secret-token-abc123";
    const cache = new GraphCache({
      collect: async () => {
        throw new Error(`Jira search failed: url contained ${SECRET}`);
      },
      refreshSeconds: 30,
      fixtureGraph: FIXTURE,
      sanitizeError: (cause) => (cause instanceof Error ? cause.message.split(SECRET).join("[redacted]") : String(cause)),
    });

    const result = await cache.getGraph();
    const body = JSON.stringify(result);

    expect(body).not.toContain(SECRET);
  });

  test("size/layout config: defaults are echoed when the caller omits sizeConfig/layoutConfig", async () => {
    const cache = new GraphCache({
      collect: async () => graph(),
      refreshSeconds: 30,
      fixtureGraph: FIXTURE,
      sanitizeError: (e) => String(e),
    });

    const result = await cache.getGraph();

    expect(result.sizeBase).toBe(1.5);
    expect(result.sizeActive).toBe(2);
    expect(result.linkDistance).toBe(40);
    expect(result.charge).toBe(120);
    expect(result.gravity).toBe(0.08);
  });

  test("size/layout config: an explicit sizeConfig/layoutConfig is echoed on every response, fresh or stale", async () => {
    const cache = new GraphCache({
      collect: async () => {
        throw new Error("no credentials");
      },
      refreshSeconds: 30,
      fixtureGraph: FIXTURE,
      sanitizeError: (e) => String(e),
      sizeConfig: { base: 3, active: 11 },
      layoutConfig: { linkDistance: 25, charge: 90, gravity: 0.2 },
    });

    const result = await cache.getGraph();

    expect(result.sizeBase).toBe(3);
    expect(result.sizeActive).toBe(11);
    expect(result.linkDistance).toBe(25);
    expect(result.charge).toBe(90);
    expect(result.gravity).toBe(0.2);
  });
});
