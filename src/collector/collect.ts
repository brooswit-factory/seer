import type { SeerConfig } from "../config/schema.ts";
import type { Graph, GraphEdge, GraphNode, QueryRecord } from "../graph/schema.ts";
import { SCHEMA_VERSION } from "../graph/schema.ts";
import type { Provider, ProviderMatch } from "./types.ts";

interface Attribution {
  match: ProviderMatch;
  ownerSourceId: string;
  discovery: "query" | "link";
}

/**
 * Shared-node attribution decision (recorded on FACTORY-855, per FACTORY-855 item 3): a query
 * hit always wins over a link-discovery, regardless of which source's query found it. If two
 * sources' queries both match the same resource directly, whichever source is processed first
 * (config array order) keeps it — deterministic, not a tie-break on recency.
 */
function upsertNode(byId: Map<string, Attribution>, match: ProviderMatch, ownerSourceId: string, discovery: "query" | "link") {
  const existing = byId.get(match.id);
  if (!existing) {
    byId.set(match.id, { match, ownerSourceId, discovery });
    return;
  }
  if (discovery === "query" && existing.discovery === "link") {
    byId.set(match.id, { match, ownerSourceId, discovery });
  }
}

export interface CollectOptions {
  /** Max resources returned per query; a provider total above this is marked `truncated`. */
  resultCap: number;
}

/**
 * Runs every source's queries, expands links to `config.linkDepth` hops, dedupes, and returns a
 * schema-conformant {@link Graph}. A single failing query is recorded as an error and does not
 * abort the snapshot (FACTORY-855 item 7 / FACTORY-841's single most important correctness
 * property for this tool).
 */
export async function collect(config: SeerConfig, providers: Record<string, Provider>, options: CollectOptions): Promise<Graph> {
  const byId = new Map<string, Attribution>();
  const queries: QueryRecord[] = [];
  const edgeKeys = new Set<string>();
  const edges: GraphEdge[] = [];

  function addEdge(source: string, target: string, kind: GraphEdge["kind"]) {
    const key = `${source}|${target}|${kind}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ source, target, kind });
  }

  // Pass 1: run every source's queries. A matched resource is owned by the source whose query found it.
  let frontier: Array<{ fromId: string; targetId: string; kind: GraphEdge["kind"]; ownerSourceId: string }> = [];

  for (const source of config.sources) {
    for (const q of source.queries) {
      const provider = providers[q.provider];
      if (!provider) {
        queries.push({ sourceId: source.id, provider: q.provider, query: q.query, matched: 0, error: `no provider registered for "${q.provider}"`, truncated: false });
        continue;
      }
      try {
        const { matches, truncated } = await provider.runQuery(q.query, options.resultCap);
        for (const match of matches) {
          upsertNode(byId, match, source.id, "query");
          for (const link of match.links) {
            frontier.push({ fromId: match.id, targetId: link.targetId, kind: link.kind, ownerSourceId: source.id });
          }
        }
        queries.push({
          sourceId: source.id,
          provider: q.provider,
          query: q.query,
          matched: matches.length,
          error: null,
          truncated,
        });
      } catch (cause) {
        queries.push({
          sourceId: source.id,
          provider: q.provider,
          query: q.query,
          matched: 0,
          error: (cause as Error).message,
          truncated: false,
        });
      }
    }
  }

  // Pass 2: expand links to `linkDepth` hops. A link to an already-known node just adds the edge;
  // a link to a new resource fetches it (discovery = "link") and queues its own links for the next hop.
  for (let hop = 0; hop < config.linkDepth; hop++) {
    if (frontier.length === 0) break;
    const nextFrontier: typeof frontier = [];
    for (const { fromId, targetId, kind, ownerSourceId } of frontier) {
      if (!byId.has(targetId)) {
        const [providerKey] = targetId.split(":", 1);
        const provider = providerKey ? providers[providerKey] : undefined;
        if (!provider) continue;
        let fetched: ProviderMatch | null = null;
        try {
          fetched = await provider.fetchById(targetId);
        } catch (cause) {
          console.warn(`seer: link expansion could not fetch ${targetId}: ${(cause as Error).message}`);
          continue;
        }
        if (!fetched) continue;
        upsertNode(byId, fetched, ownerSourceId, "link");
        for (const link of fetched.links) {
          nextFrontier.push({ fromId: fetched.id, targetId: link.targetId, kind: link.kind, ownerSourceId });
        }
      }
      if (byId.has(targetId)) {
        addEdge(fromId, targetId, kind);
      }
    }
    frontier = nextFrontier;
  }

  const nodes: GraphNode[] = [...byId.values()].map(({ match, ownerSourceId, discovery }) => ({
    id: match.id,
    provider: match.provider,
    label: match.label,
    url: match.url,
    ownerSourceId,
    agentStatus: match.agentStatus,
    providerCanReportStatus: match.providerCanReportStatus,
    admissionWithheld: match.admissionWithheld,
    discovery,
    ...(match.resourceType !== undefined ? { resourceType: match.resourceType } : {}),
    ...(match.jiraStatus !== undefined ? { jiraStatus: match.jiraStatus } : {}),
  }));

  // Project nodes (FACTORY-911, extended by FACTORY-977): synthesised from any match's `project`
  // field, never fetched as their own query hit — one node per distinct project key that has at
  // least one ticket node in the graph, a `contains` edge to every Epic of that project already
  // present (query- or link-discovered alike) PLUS every non-Done Bug of that project (every Bug
  // is a member of its project by Jira membership, whether or not it also carries its own
  // Implements link to an Epic — that link, if present, is left untouched), and nothing else:
  // never a Story/Task, which hang off their Bug/Epic via Implements instead. `ownerSourceId` is
  // the owning source of whichever of that project's tickets was attributed first, so a project
  // still groups sensibly under the compact-layout hull even though it was never itself matched
  // by a query.
  const projectsByKey = new Map<string, { name: string; url: string; ownerSourceId: string }>();
  for (const { match, ownerSourceId } of byId.values()) {
    if (!match.project || projectsByKey.has(match.project.key)) continue;
    projectsByKey.set(match.project.key, { name: match.project.name, url: match.project.url, ownerSourceId });
  }

  for (const [key, project] of projectsByKey) {
    nodes.push({
      id: `jira-project:${key}`,
      provider: "jira-project",
      label: `${key} ${project.name}`,
      url: project.url,
      ownerSourceId: project.ownerSourceId,
      agentStatus: "none",
      providerCanReportStatus: false,
      admissionWithheld: false,
      discovery: "query",
      resourceType: "project",
    });
  }

  for (const { match } of byId.values()) {
    if (!match.project) continue;
    const isEpic = match.resourceType === "Epic";
    const isOpenBug = match.resourceType === "Bug" && match.jiraStatus?.category !== "done";
    if (!isEpic && !isOpenBug) continue;
    addEdge(`jira-project:${match.project.key}`, match.id, "contains");
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    snapshotTimestamp: new Date().toISOString(),
    nodes,
    edges,
    queries,
  };
}
