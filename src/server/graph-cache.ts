import type { Graph } from "../graph/schema.ts";
import { parseGraph } from "../graph/validate.ts";
import type { LayoutConfig, SizeConfig } from "../config/env.ts";

/** Matches `loadSizeConfig()`'s own defaults — used only when a caller (e.g. a test) omits `sizeConfig`. */
const DEFAULT_SIZE_CONFIG: SizeConfig = { base: 1.5, active: 2 };
/** Matches `loadLayoutConfig()`'s own defaults — used only when a caller omits `layoutConfig`. */
const DEFAULT_LAYOUT_CONFIG: LayoutConfig = { linkDistance: 40, charge: 120, gravity: 0.08 };

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
  /** Node-size multipliers (FACTORY-890), echoed on every response. Defaults to `loadSizeConfig()`'s own defaults. */
  sizeConfig?: SizeConfig;
  /** Compact-layout force constants (FACTORY-890), echoed on every response. Defaults to `loadLayoutConfig()`'s own defaults. */
  layoutConfig?: LayoutConfig;
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
  private readonly sizeConfig: SizeConfig;
  private readonly layoutConfig: LayoutConfig;

  /** Number of real `collect()` runs started — exposed only so tests can assert single-flight behaviour. */
  collectCount = 0;

  constructor(private readonly options: GraphCacheOptions) {
    this.now = options.now ?? Date.now;
    this.sizeConfig = options.sizeConfig ?? DEFAULT_SIZE_CONFIG;
    this.layoutConfig = options.layoutConfig ?? DEFAULT_LAYOUT_CONFIG;
  }

  async getGraph(): Promise<Graph> {
    const ttlMs = this.options.refreshSeconds * 1000;
    if (this.lastGood && this.lastGoodAt !== null && this.now() - this.lastGoodAt < ttlMs) {
      return this.withMeta(this.lastGood, { stale: false, staleSince: null, error: null, usingFixture: false });
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
      this.lastGood = graph;
      this.lastGoodAt = this.now();
      return this.withMeta(graph, { stale: false, staleSince: null, error: null, usingFixture: false });
    } catch (cause) {
      const error = this.options.sanitizeError(cause);
      if (this.lastGood && this.lastGoodAt !== null) {
        return this.withMeta(this.lastGood, { stale: true, staleSince: new Date(this.lastGoodAt).toISOString(), error, usingFixture: false });
      }
      return this.withMeta(this.options.fixtureGraph, { stale: true, staleSince: null, error, usingFixture: true });
    }
  }

  private withMeta(graph: Graph, meta: { stale: boolean; staleSince: string | null; error: string | null; usingFixture: boolean }): Graph {
    return {
      ...graph,
      ...meta,
      refreshSeconds: this.options.refreshSeconds,
      sizeBase: this.sizeConfig.base,
      sizeActive: this.sizeConfig.active,
      linkDistance: this.layoutConfig.linkDistance,
      charge: this.layoutConfig.charge,
      gravity: this.layoutConfig.gravity,
    };
  }
}
