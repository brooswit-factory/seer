import { describe, expect, test } from "bun:test";
import { collect } from "../src/collector/collect.ts";
import type { Provider, ProviderMatch } from "../src/collector/types.ts";
import type { SeerConfig } from "../src/config/schema.ts";

/** `name` becomes the canonical id "stub:<name>" — ids are provider-qualified in production (e.g. "jira-work:FACTORY-841"), so the collector's link-expansion step keys providers off that prefix. */
function match(name: string, overrides: Partial<ProviderMatch> = {}): ProviderMatch {
  return {
    id: `stub:${name}`,
    provider: "stub",
    label: name,
    url: `https://example.com/${name}`,
    agentStatus: "idle",
    providerCanReportStatus: true,
    admissionWithheld: false,
    links: [],
    ...overrides,
  };
}

/** A provider whose behaviour per query string is entirely scripted, for deterministic tests. */
class StubProvider implements Provider {
  readonly name = "stub";
  constructor(
    private readonly byQuery: Record<string, { matches: ProviderMatch[]; truncated?: boolean } | Error>,
    private readonly byId: Record<string, ProviderMatch | null> = {},
  ) {}

  async runQuery(query: string, _cap: number): Promise<{ matches: ProviderMatch[]; truncated: boolean }> {
    const result = this.byQuery[query];
    if (result === undefined) throw new Error(`StubProvider: unscripted query "${query}"`);
    if (result instanceof Error) throw result;
    return { matches: result.matches, truncated: result.truncated ?? false };
  }

  async fetchById(id: string): Promise<ProviderMatch | null> {
    return this.byId[id] ?? null;
  }
}

function configWith(sources: SeerConfig["sources"], linkDepth = 1): SeerConfig {
  return { sources, linkDepth, port: 4173, resultCap: 50, refreshSeconds: 30, collectTimeoutSeconds: 60 };
}

describe("collect", () => {
  test("multi-source attribution: each source's query hits are attributed to that source", async () => {
    const config = configWith([
      { id: "a@m1", machine: "m1", user: "a", displayName: "A", queries: [{ provider: "stub", query: "qa" }] },
      { id: "b@m1", machine: "m1", user: "b", displayName: "B", queries: [{ provider: "stub", query: "qb" }] },
    ]);
    const provider = new StubProvider({
      qa: { matches: [match("n1")] },
      qb: { matches: [match("n2")] },
    });

    const graph = await collect(config, { stub: provider }, { resultCap: 50 });

    const n1 = graph.nodes.find((n) => n.id === "stub:n1");
    const n2 = graph.nodes.find((n) => n.id === "stub:n2");
    expect(n1?.ownerSourceId).toBe("a@m1");
    expect(n2?.ownerSourceId).toBe("b@m1");
    expect(n1?.discovery).toBe("query");
    expect(n2?.discovery).toBe("query");
  });

  test("dedupe: the same resource reached by a query and a link is ONE node, attributed to the query hit", async () => {
    const config = configWith([
      {
        id: "a@m1",
        machine: "m1",
        user: "a",
        displayName: "A",
        queries: [{ provider: "stub", query: "qa" }],
      },
      {
        id: "b@m1",
        machine: "m1",
        user: "b",
        displayName: "B",
        queries: [{ provider: "stub", query: "qb" }],
      },
    ]);
    const provider = new StubProvider(
      {
        qa: { matches: [match("shared", { links: [] })] },
        qb: { matches: [match("linker", { links: [{ targetId: "stub:shared", kind: "link" }] })] },
      },
      {},
    );

    const graph = await collect(config, { stub: provider }, { resultCap: 50 });

    const sharedNodes = graph.nodes.filter((n) => n.id === "stub:shared");
    expect(sharedNodes).toHaveLength(1);
    expect(sharedNodes[0]?.ownerSourceId).toBe("a@m1"); // the query hit, not the link source
    expect(sharedNodes[0]?.discovery).toBe("query");
    // the edge from the linking node to the shared node still exists
    expect(graph.edges.some((e) => e.source === "stub:linker" && e.target === "stub:shared")).toBe(true);
  });

  test("one-hop link expansion discovers a neighbour no query matched, marked distinctly", async () => {
    const config = configWith([
      { id: "a@m1", machine: "m1", user: "a", displayName: "A", queries: [{ provider: "stub", query: "qa" }] },
    ]);
    const provider = new StubProvider(
      { qa: { matches: [match("hit", { links: [{ targetId: "stub:neighbour", kind: "relates" }] })] } },
      { "stub:neighbour": match("neighbour") },
    );

    const graph = await collect(config, { stub: provider }, { resultCap: 50 });

    const neighbour = graph.nodes.find((n) => n.id === "stub:neighbour");
    expect(neighbour).toBeDefined();
    expect(neighbour?.discovery).toBe("link");
    expect(neighbour?.ownerSourceId).toBe("a@m1");
    expect(graph.edges.some((e) => e.source === "stub:hit" && e.target === "stub:neighbour" && e.kind === "relates")).toBe(true);
  });

  test("linkDepth 0 performs no expansion at all", async () => {
    const config = configWith(
      [{ id: "a@m1", machine: "m1", user: "a", displayName: "A", queries: [{ provider: "stub", query: "qa" }] }],
      0,
    );
    const provider = new StubProvider(
      { qa: { matches: [match("hit", { links: [{ targetId: "stub:neighbour", kind: "relates" }] })] } },
      { "stub:neighbour": match("neighbour") },
    );

    const graph = await collect(config, { stub: provider }, { resultCap: 50 });

    expect(graph.nodes.map((n) => n.id)).toEqual(["stub:hit"]);
    expect(graph.edges).toHaveLength(0);
  });

  test("a failing query is recorded as an error and does not abort the snapshot", async () => {
    const config = configWith([
      {
        id: "a@m1",
        machine: "m1",
        user: "a",
        displayName: "A",
        queries: [
          { provider: "stub", query: "ok" },
          { provider: "stub", query: "broken" },
        ],
      },
    ]);
    const provider = new StubProvider({
      ok: { matches: [match("survivor")] },
      broken: new Error("provider request timed out after 10000ms"),
    });

    const graph = await collect(config, { stub: provider }, { resultCap: 50 });

    expect(graph.nodes.map((n) => n.id)).toEqual(["stub:survivor"]);
    const failedRecord = graph.queries.find((q) => q.query === "broken");
    const okRecord = graph.queries.find((q) => q.query === "ok");
    expect(failedRecord?.error).toBe("provider request timed out after 10000ms");
    expect(okRecord?.error).toBeNull();
  });

  test("cap truncation is labelled, not read as the whole answer", async () => {
    const config = configWith([
      { id: "a@m1", machine: "m1", user: "a", displayName: "A", queries: [{ provider: "stub", query: "big" }] },
    ]);
    const provider = new StubProvider({
      // The provider itself decides truncation (e.g. by requesting cap+1) — the collector just
      // relays the flag, since Jira's current search endpoint reports no total count to compare.
      big: { matches: [match("n1"), match("n2")], truncated: true },
    });

    const graph = await collect(config, { stub: provider }, { resultCap: 2 });

    const record = graph.queries[0];
    expect(record?.matched).toBe(2);
    expect(record?.truncated).toBe(true);
  });

  test("resourceType flows through from the provider match onto the graph node (FACTORY-876)", async () => {
    const config = configWith([
      { id: "a@m1", machine: "m1", user: "a", displayName: "A", queries: [{ provider: "stub", query: "qa" }] },
    ]);
    const provider = new StubProvider({
      qa: { matches: [match("typed", { resourceType: "Epic" }), match("untyped")] },
    });

    const graph = await collect(config, { stub: provider }, { resultCap: 50 });

    expect(graph.nodes.find((n) => n.id === "stub:typed")?.resourceType).toBe("Epic");
    expect(graph.nodes.find((n) => n.id === "stub:untyped")?.resourceType).toBeUndefined();
  });

  test("jiraStatus flows through from the provider match onto the graph node (FACTORY-900)", async () => {
    const config = configWith([
      { id: "a@m1", machine: "m1", user: "a", displayName: "A", queries: [{ provider: "stub", query: "qa" }] },
    ]);
    const provider = new StubProvider({
      qa: {
        matches: [
          match("withStatus", { jiraStatus: { name: "In Review", category: "indeterminate" } }),
          match("withoutStatus"),
        ],
      },
    });

    const graph = await collect(config, { stub: provider }, { resultCap: 50 });

    expect(graph.nodes.find((n) => n.id === "stub:withStatus")?.jiraStatus).toEqual({ name: "In Review", category: "indeterminate" });
    expect(graph.nodes.find((n) => n.id === "stub:withoutStatus")?.jiraStatus).toBeUndefined();
  });

  test("an unregistered provider is a recorded error, not a crash", async () => {
    const config = configWith([
      { id: "a@m1", machine: "m1", user: "a", displayName: "A", queries: [{ provider: "nonexistent", query: "q" }] },
    ]);

    const graph = await collect(config, {}, { resultCap: 50 });

    expect(graph.nodes).toHaveLength(0);
    expect(graph.queries[0]?.error).toContain("nonexistent");
  });
});
