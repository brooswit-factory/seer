import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { validateGraph, parseGraph } from "../src/graph/validate.ts";

function loadFixture(): unknown {
  const path = new URL("../fixtures/graph.example.json", import.meta.url).pathname;
  return JSON.parse(readFileSync(path, "utf-8"));
}

describe("graph fixture", () => {
  test("the committed fixture validates", () => {
    const fixture = loadFixture();
    const result = validateGraph(fixture);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  test("a mutated copy with a dangling edge fails", () => {
    const fixture = loadFixture() as { edges: Array<{ source: string; target: string; kind: string }> };
    const mutated = { ...fixture, edges: [...fixture.edges, { source: "jira-work:FACTORY-841", target: "nonexistent:node", kind: "relates" }] };
    const result = validateGraph(mutated);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("nonexistent:node"))).toBe(true);
  });

  test("a mutated copy with a duplicate node id fails", () => {
    const fixture = loadFixture() as { nodes: Array<Record<string, unknown>> };
    const mutated = { ...fixture, nodes: [...fixture.nodes, fixture.nodes[0]] };
    const result = validateGraph(mutated);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("duplicate node id"))).toBe(true);
  });
});

describe("validateGraph", () => {
  const base = {
    schemaVersion: 1,
    snapshotTimestamp: "2026-01-01T00:00:00Z",
    nodes: [
      {
        id: "jira-work:X-1",
        provider: "jira-work",
        label: "X-1",
        url: "https://example.com/X-1",
        ownerSourceId: "u1@machine1",
        agentStatus: "working",
        providerCanReportStatus: true,
        admissionWithheld: false,
      },
    ],
    edges: [],
    queries: [{ sourceId: "u1@machine1", provider: "jira-work", query: "x", matched: 1, error: null }],
  };

  test("accepts a minimal valid graph", () => {
    expect(validateGraph(base).valid).toBe(true);
  });

  test("rejects an invalid agentStatus value", () => {
    const bad = { ...base, nodes: [{ ...base.nodes[0], agentStatus: "unknown" }] };
    const result = validateGraph(bad);
    expect(result.valid).toBe(false);
  });

  test("rejects a non-ISO snapshotTimestamp", () => {
    const bad = { ...base, snapshotTimestamp: "not a date" };
    expect(validateGraph(bad).valid).toBe(false);
  });

  test("parseGraph throws a clear error naming the field path", () => {
    expect(() => parseGraph({ ...base, nodes: [{ ...base.nodes[0], agentStatus: "unknown" }] })).toThrow(
      /agentStatus/,
    );
  });

  test("distinguishes a failed query from a zero-match query", () => {
    const withBoth = {
      ...base,
      queries: [
        { sourceId: "u1@machine1", provider: "jira-work", query: "zero", matched: 0, error: null },
        { sourceId: "u1@machine1", provider: "jira-work", query: "failed", matched: 0, error: "timeout" },
      ],
    };
    const result = validateGraph(withBoth);
    expect(result.valid).toBe(true);
  });
});
