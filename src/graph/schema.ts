import { z } from "zod";

export const SCHEMA_VERSION = 1;

/**
 * butchr's five mutually-exclusive `agent:*` label values (verified against
 * butchr's own src/labels/registry.ts). "none" means the provider reports
 * status and found no agent running — see `providerCanReportStatus` below
 * for the separate "this provider cannot report status at all" case.
 */
export const AgentStatusSchema = z.enum(["working", "idle", "blocked", "stalled", "none"]);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

/**
 * A small, closed, documented set of edge kinds:
 * - "implements": a Task/Story implements a Story/Epic (butchr's Implements link)
 * - "blocks": one resource blocks another
 * - "relates": a generic, undirected relationship
 * - "parent": a native parent/child hierarchy (e.g. Epic -> Story)
 * - "link": any other link-expansion hop not covered above
 */
export const EdgeKindSchema = z.enum(["implements", "blocks", "relates", "parent", "link"]);
export type EdgeKind = z.infer<typeof EdgeKindSchema>;

export const GraphNodeSchema = z.object({
  /** Canonical provider-qualified id, e.g. "jira-work:FACTORY-859". Unique within the graph. */
  id: z.string().min(1),
  provider: z.string().min(1),
  label: z.string().min(1),
  url: z.string().min(1),
  /** The (machine, user) source id (config's `sources[].id`) this node sits under, for hull grouping. */
  ownerSourceId: z.string().min(1),
  agentStatus: AgentStatusSchema,
  /** Distinguishes "this provider cannot report status" (false) from "it reports none" (true + agentStatus "none"). */
  providerCanReportStatus: z.boolean(),
  admissionWithheld: z.boolean(),
  /** "query": this node matched one of its owning source's queries directly. "link": reached only by one-hop link expansion from a query hit — the viewer must mark these distinctly. */
  discovery: z.enum(["query", "link"]),
  /**
   * The kind of resource this node represents, e.g. a Jira issue type name ("Epic", "Story",
   * "Task", "Bug", "Sub-task", or any other issue type name a Jira instance reports) or a
   * non-Jira provider's own value (e.g. "pull-request", "github-issue", "confluence-page").
   * OPTIONAL and absent on old graph.json data — the viewer falls back to an "other/unknown"
   * shape when it is missing, never a validation failure (FACTORY-876).
   */
  resourceType: z.string().min(1).optional(),
});
export type GraphNode = z.infer<typeof GraphNodeSchema>;

export const GraphEdgeSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  kind: EdgeKindSchema,
});
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

/** One record per configured query, so a failed query is distinguishable from a zero-match one. */
export const QueryRecordSchema = z.object({
  sourceId: z.string().min(1),
  provider: z.string().min(1),
  query: z.string().min(1),
  matched: z.number().int().min(0),
  error: z.string().nullable().optional(),
  /** True when this query's results were cut off by the per-query result cap — `matched` is the capped count, not the true total. */
  truncated: z.boolean().default(false),
});
export type QueryRecord = z.infer<typeof QueryRecordSchema>;

/**
 * Live-serving metadata (FACTORY-875): all optional, so a plain collector-produced snapshot (or
 * the pre-FACTORY-875 fixture) stays schema-valid without them. `src/server/graph-cache.ts` is
 * the one place that always sets every one of these fields on what it actually serves.
 */
export const GraphSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  /** ISO-8601 timestamp of when this snapshot was taken. */
  snapshotTimestamp: z.string().datetime({ offset: true }),
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
  queries: z.array(QueryRecordSchema),
  /** True when this response is not a fresh collection: either a cached last-good snapshot served after a Jira failure, or the committed fixture. */
  stale: z.boolean().optional(),
  /** ISO-8601 timestamp of the last successful collection, present only alongside `stale: true` for a cached (non-fixture) snapshot. */
  staleSince: z.string().datetime({ offset: true }).nullable().optional(),
  /** Short, credential-sanitised description of the most recent collection failure; null on a fresh response. */
  error: z.string().nullable().optional(),
  /** True only when no collection has ever succeeded and this is the committed fixture, not real data. */
  usingFixture: z.boolean().optional(),
  /** The server's configured cache TTL in seconds, echoed so the viewer polls on the same interval. */
  refreshSeconds: z.number().int().positive().optional(),
  /**
   * Node-size multipliers (FACTORY-890), from `SEER_SIZE_BASE`/`SEER_SIZE_ACTIVE` — echoed so the
   * viewer never hardcodes them. `sizeActive` REPLACES `sizeBase` for a live-agent node, it is
   * never stacked on top of it.
   */
  sizeBase: z.number().positive().optional(),
  sizeActive: z.number().positive().optional(),
  /** Compact-layout force-simulation constants (FACTORY-890), from `SEER_LINK_DISTANCE`/`SEER_CHARGE`/`SEER_GRAVITY`. */
  linkDistance: z.number().positive().optional(),
  charge: z.number().positive().optional(),
  gravity: z.number().positive().optional(),
});
export type Graph = z.infer<typeof GraphSchema>;
