import { describe, expect, test } from "bun:test";
import { GraphCache } from "../src/server/graph-cache.ts";
import { createSanitizeError } from "../src/server/sanitize-error.ts";
import type { Graph, QueryRecord } from "../src/graph/schema.ts";

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

function queryRecord(overrides: Partial<QueryRecord> = {}): QueryRecord {
  return {
    sourceId: "a@m1",
    provider: "jira-work",
    query: "project = FOO",
    matched: 0,
    error: null,
    truncated: false,
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

  test("all-queries-errored collect (after a good fetch) falls back to the last good snapshot, marked stale, and does not overwrite lastGood", async () => {
    const c = clock();
    let outage = false;
    const cache = new GraphCache({
      collect: async () => {
        if (!outage) return graph({ snapshotTimestamp: "2026-05-01T00:00:00Z", queries: [queryRecord({ matched: 3, error: null })] });
        return graph({
          snapshotTimestamp: "2026-05-02T00:00:00Z",
          nodes: [],
          queries: [
            queryRecord({ sourceId: "a@m1", matched: 0, error: "fetch failed: ECONNREFUSED" }),
            queryRecord({ sourceId: "b@m1", matched: 0, error: "fetch failed: ECONNREFUSED" }),
          ],
        });
      },
      refreshSeconds: 15,
      fixtureGraph: FIXTURE,
      sanitizeError: (e) => String(e),
      now: c.now,
    });

    const first = await cache.getGraph();
    expect(first.stale).toBe(false);
    expect(first.snapshotTimestamp).toBe("2026-05-01T00:00:00Z");

    c.advance(15_001);
    outage = true;
    const second = await cache.getGraph();

    expect(second.stale).toBe(true);
    expect(second.staleSince).not.toBeNull();
    expect(second.error).not.toBeNull();
    expect(second.usingFixture).toBe(false);
    expect(second.snapshotTimestamp).toBe("2026-05-01T00:00:00Z"); // still the last GOOD snapshot

    // A subsequent total-failure refresh still serves the good snapshot — lastGood was never overwritten.
    c.advance(15_001);
    const third = await cache.getGraph();
    expect(third.stale).toBe(true);
    expect(third.snapshotTimestamp).toBe("2026-05-01T00:00:00Z");
  });

  test("partial failure (some queries matched, some errored) keeps serving the fresh graph with the error visible in queries[]", async () => {
    const cache = new GraphCache({
      collect: async () =>
        graph({
          queries: [
            queryRecord({ sourceId: "a@m1", matched: 2, error: null }),
            queryRecord({ sourceId: "b@m1", matched: 0, error: "fetch failed: ECONNREFUSED" }),
          ],
        }),
      refreshSeconds: 30,
      fixtureGraph: FIXTURE,
      sanitizeError: (e) => String(e),
    });

    const result = await cache.getGraph();

    expect(result.stale).toBe(false);
    expect(result.error).toBeNull();
    expect(result.usingFixture).toBe(false);
    expect(result.queries.find((q) => q.sourceId === "b@m1")?.error).toBe("fetch failed: ECONNREFUSED");
  });

  test("a healthy zero-match collect (queries ran, matched nothing, no errors) is NOT a total failure and is served fresh", async () => {
    const cache = new GraphCache({
      collect: async () =>
        graph({
          queries: [queryRecord({ sourceId: "a@m1", matched: 0, error: null }), queryRecord({ sourceId: "b@m1", matched: 0, error: null })],
        }),
      refreshSeconds: 30,
      fixtureGraph: FIXTURE,
      sanitizeError: (e) => String(e),
    });

    const result = await cache.getGraph();

    expect(result.stale).toBe(false);
    expect(result.error).toBeNull();
    expect(result.usingFixture).toBe(false);
  });

  test("cold start (no prior success) with an all-queries-errored collect serves the fixture, marked usingFixture", async () => {
    const cache = new GraphCache({
      collect: async () =>
        graph({
          queries: [
            queryRecord({ sourceId: "a@m1", matched: 0, error: "fetch failed: ECONNREFUSED" }),
            queryRecord({ sourceId: "b@m1", matched: 0, error: "fetch failed: ECONNREFUSED" }),
          ],
        }),
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

  test("a credential fed through a per-query provider error is redacted by the REAL sanitiser, on the fresh path, everywhere in the served payload", async () => {
    // Regression guard for the FACTORY-881 trap: stubbing sanitizeError here (as the other tests in
    // this file do, deliberately, to isolate GraphCache's own logic) would prove nothing about
    // whether the real redaction logic actually strips the secret. This test uses the production
    // createSanitizeError so a reader can trust the result as evidence about the real path.
    const SECRET = "atlassian-api-token-abc123xyz";
    const sanitizeError = createSanitizeError([SECRET]);
    const cache = new GraphCache({
      collect: async () =>
        graph({
          queries: [
            queryRecord({ sourceId: "a@m1", matched: 1, error: null }),
            queryRecord({
              sourceId: "b@m1",
              matched: 0,
              error: `Jira search failed (401 Unauthorized): invalid token=${SECRET} in request`,
            }),
          ],
        }),
      refreshSeconds: 30,
      fixtureGraph: FIXTURE,
      sanitizeError,
    });

    const result = await cache.getGraph();
    const body = JSON.stringify(result);

    expect(body).not.toContain(SECRET);
    expect(result.queries.find((q) => q.sourceId === "b@m1")?.error).toContain("[redacted]");
  });

  test("a credential fed through a per-query provider error is redacted by the REAL sanitiser on the STALE (lastGood) path", async () => {
    const SECRET = "atlassian-api-token-stale-456";
    const sanitizeError = createSanitizeError([SECRET]);
    const c = clock();
    let outage = false;
    const cache = new GraphCache({
      collect: async () => {
        if (!outage) return graph({ queries: [queryRecord({ sourceId: "a@m1", matched: 1, error: null })] });
        return graph({
          queries: [
            queryRecord({ sourceId: "a@m1", matched: 0, error: `fetch failed: token=${SECRET}` }),
            queryRecord({ sourceId: "b@m1", matched: 0, error: `fetch failed: token=${SECRET}` }),
          ],
        });
      },
      refreshSeconds: 15,
      fixtureGraph: FIXTURE,
      sanitizeError,
      now: c.now,
    });

    await cache.getGraph();
    c.advance(15_001);
    outage = true;
    const result = await cache.getGraph();
    const body = JSON.stringify(result);

    expect(result.stale).toBe(true);
    expect(body).not.toContain(SECRET);
  });

  test("a credential fed through a per-query provider error is redacted by the REAL sanitiser on the FIXTURE (cold start) path", async () => {
    const SECRET = "atlassian-api-token-fixture-789";
    const sanitizeError = createSanitizeError([SECRET]);
    const cache = new GraphCache({
      collect: async () =>
        graph({
          queries: [
            queryRecord({ sourceId: "a@m1", matched: 0, error: `fetch failed: token=${SECRET}` }),
            queryRecord({ sourceId: "b@m1", matched: 0, error: `fetch failed: token=${SECRET}` }),
          ],
        }),
      refreshSeconds: 30,
      fixtureGraph: FIXTURE,
      sanitizeError,
    });

    const result = await cache.getGraph();
    const body = JSON.stringify(result);

    expect(result.usingFixture).toBe(true);
    expect(body).not.toContain(SECRET);
  });
});
