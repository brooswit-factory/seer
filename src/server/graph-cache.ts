import type { Graph } from "../graph/schema.ts";
import { parseGraph } from "../graph/validate.ts";

/**
 * True when `collect()` resolved but found nothing because every source failed: every entry in
 * `queries[]` is both unmatched and errored. Must be treated exactly like a thrown collect (see
 * `refresh()` below) rather than promoted to `lastGood`.
 *
 * Judgement call (FACTORY-903/FACTORY-904): `QueryRecord.provider` carries only the provider's
 * key string (e.g. "jira-work"), never a jira/non-jira discriminator, and the cache sees no
 * provider objects at all — only the `Graph` `collect()` resolves to. There is no field here to
 * scope this to "jira providers" by, so it is applied uniformly across every entry in
 * `queries[]`; this is also the more conservative reading, since a non-jira provider's failure
 * joins the same outage signal instead of being invisible to it. An empty `queries[]` is
 * excluded explicitly (`length > 0`) so a vacuous `every()` can never be mistaken for a total
 * outage, and a healthy zero-match collect (queries ran, matched nothing, no errors) fails the
 * `error != null` arm of the predicate and is correctly left to serve fresh.
 */
function isTotalFailure(graph: Graph): boolean {
  return graph.queries.length > 0 && graph.queries.every((q) => q.matched === 0 && q.error != null);
}

/** A representative `Error` for the top-level `error` field when every query failed but nothing threw. */
function totalFailureCause(graph: Graph): Error {
  const sample = graph.queries.find((q) => q.error != null)?.error;
  return new Error(sample ? `every query failed: ${sample}` : "every query failed");
}

export interface GraphCacheOptions {
  /** Runs one real collection and returns a schema-conformant graph. Throws on any failure. */
  collect: () => Promise<Graph>;
  /** Cache TTL in seconds — also the value echoed to the viewer as `refreshSeconds`. */
  refreshSeconds: number;
  /** Served, marked `usingFixture: true`, only when no collection has ever succeeded. */
  fixtureGraph: Graph;
  /** Strips credential values out of a collection failure before it can reach a response body or a log line. */
  sanitizeError: (cause: unknown) => string;
  /** Injectable clock, for deterministic TTL tests. */
  now?: () => number;
}

/**
 * In-process cache + single-flight + stale-fallback for `/graph.json` (FACTORY-875).
 *
 * Single-flight relies on JS being single-threaded with no `await` between the TTL check and
 * setting `inFlight`: any number of `getGraph()` calls made before the first one resumes from its
 * `await` all observe the same `inFlight` promise and trigger exactly one `collect()` run.
 */
export class GraphCache {
  private lastGood: Graph | null = null;
  private lastGoodAt: number | null = null;
  private inFlight: Promise<Graph> | null = null;
  private readonly now: () => number;

  /** Number of real `collect()` runs started — exposed only so tests can assert single-flight behaviour. */
  collectCount = 0;

  constructor(private readonly options: GraphCacheOptions) {
    this.now = options.now ?? Date.now;
  }

  async getGraph(): Promise<Graph> {
    const ttlMs = this.options.refreshSeconds * 1000;
    if (this.lastGood && this.lastGoodAt !== null && this.now() - this.lastGoodAt < ttlMs) {
      return this.withMeta(this.sanitizeQueries(this.lastGood), { stale: false, staleSince: null, error: null, usingFixture: false });
    }
    if (this.inFlight) {
      return this.inFlight;
    }
    this.inFlight = this.refresh();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async refresh(): Promise<Graph> {
    this.collectCount++;
    try {
      const graph = parseGraph(await this.options.collect());
      if (isTotalFailure(graph)) {
        return this.serveFailure(totalFailureCause(graph));
      }
      this.lastGood = graph;
      this.lastGoodAt = this.now();
      return this.withMeta(this.sanitizeQueries(graph), { stale: false, staleSince: null, error: null, usingFixture: false });
    } catch (cause) {
      return this.serveFailure(cause);
    }
  }

  private serveFailure(cause: unknown): Graph {
    const error = this.options.sanitizeError(cause);
    if (this.lastGood && this.lastGoodAt !== null) {
      return this.withMeta(this.sanitizeQueries(this.lastGood), {
        stale: true,
        staleSince: new Date(this.lastGoodAt).toISOString(),
        error,
        usingFixture: false,
      });
    }
    return this.withMeta(this.sanitizeQueries(this.options.fixtureGraph), {
      stale: true,
      staleSince: null,
      error,
      usingFixture: true,
    });
  }

  /** Applies the credential sanitiser to every `queries[].error` — every path this cache serves must redact it, not only the top-level `error`. */
  private sanitizeQueries(graph: Graph): Graph {
    return {
      ...graph,
      queries: graph.queries.map((q) => (q.error != null ? { ...q, error: this.options.sanitizeError(q.error) } : q)),
    };
  }

  private withMeta(graph: Graph, meta: { stale: boolean; staleSince: string | null; error: string | null; usingFixture: boolean }): Graph {
    return { ...graph, ...meta, refreshSeconds: this.options.refreshSeconds };
  }
}
