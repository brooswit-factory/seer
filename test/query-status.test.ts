import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { classifyQueryRecord, queryStatusLabel } from "../public/query-status.js";

describe("classifyQueryRecord", () => {
  test("a failed query is distinguishable from a zero-match query", () => {
    const zeroMatch = { matched: 0, error: null, truncated: false };
    const failed = { matched: 0, error: "provider request timed out", truncated: false };
    expect(classifyQueryRecord(zeroMatch)).toBe("zero-match");
    expect(classifyQueryRecord(failed)).toBe("failed");
    expect(classifyQueryRecord(zeroMatch)).not.toBe(classifyQueryRecord(failed));
  });

  test("error wins over truncated — a capped query that also failed is reported as failed", () => {
    const record = { matched: 50, error: "rate limited", truncated: true };
    expect(classifyQueryRecord(record)).toBe("failed");
  });

  test("truncation is labelled, never read as the whole answer", () => {
    const record = { matched: 50, error: null, truncated: true };
    expect(classifyQueryRecord(record)).toBe("truncated");
    expect(queryStatusLabel(record)).toContain("truncated");
  });

  test("a clean match is ok", () => {
    expect(classifyQueryRecord({ matched: 3, error: null, truncated: false })).toBe("ok");
  });
});

describe("the committed fixture's own query records", () => {
  test("carries both a failed query and a zero-match query, and they classify differently", () => {
    const fixturePath = new URL("../fixtures/graph.example.json", import.meta.url).pathname;
    const fixture = JSON.parse(readFileSync(fixturePath, "utf-8")) as { queries: Array<Record<string, unknown>> };
    const classifications = fixture.queries.map((q) => classifyQueryRecord(q));
    expect(classifications).toContain("failed");
    expect(classifications).toContain("zero-match");
  });
});
