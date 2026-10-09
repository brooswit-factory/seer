import { describe, expect, test } from "bun:test";
import { JiraProvider } from "../src/collector/jira.ts";

/**
 * Jira Cloud removed `POST /rest/api/3/search` in favour of `GET /rest/api/3/search/jql`, which
 * returns no `total` count (verified against butchr's own working Jira client in a butchr
 * checkout, src/atlassian/client.ts — it calls exactly this endpoint). These tests pin the
 * provider to that real shape so a future regression back to the old endpoint fails loudly here
 * instead of only in a live run nobody has credentials for in this environment.
 */
function issue(key: string, overrides: Record<string, unknown> = {}) {
  return {
    key,
    fields: {
      summary: `Summary for ${key}`,
      labels: [],
      issuelinks: [],
      ...overrides,
    },
  };
}

describe("JiraProvider.runQuery", () => {
  test("calls GET /rest/api/3/search/jql, never the removed POST /search endpoint", async () => {
    let calledUrl = "";
    let calledMethod = "";
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      calledUrl = String(url);
      calledMethod = init?.method ?? "GET";
      return new Response(JSON.stringify({ issues: [issue("X-1")], isLast: true }), { status: 200 });
    }) as typeof fetch;

    const provider = new JiraProvider({ baseUrl: "https://example.atlassian.net", email: "a@b.com", apiToken: "tok", fetchImpl });
    await provider.runQuery("project = X", 10);

    expect(calledMethod).toBe("GET");
    expect(calledUrl).toContain("/rest/api/3/search/jql?");
    expect(calledUrl).not.toContain("/rest/api/3/search?");
  });

  test("parses agent:* labels into status, and defaults to none with no agent:* label", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({ issues: [issue("X-1", { labels: ["agent:blocked"] }), issue("X-2", { labels: ["some-other-label"] })], isLast: true }),
        { status: 200 },
      )) as typeof fetch;
    const provider = new JiraProvider({ baseUrl: "https://example.atlassian.net", email: "a@b.com", apiToken: "tok", fetchImpl });

    const { matches } = await provider.runQuery("q", 10);

    expect(matches.find((m) => m.id === "jira-work:X-1")?.agentStatus).toBe("blocked");
    expect(matches.find((m) => m.id === "jira-work:X-2")?.agentStatus).toBe("none");
    expect(matches.every((m) => m.providerCanReportStatus)).toBe(true);
  });

  test("admission:withheld label sets admissionWithheld", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ issues: [issue("X-1", { labels: ["admission:withheld"] })], isLast: true }), { status: 200 })) as typeof fetch;
    const provider = new JiraProvider({ baseUrl: "https://example.atlassian.net", email: "a@b.com", apiToken: "tok", fetchImpl });

    const { matches } = await provider.runQuery("q", 10);

    expect(matches[0]?.admissionWithheld).toBe(true);
  });

  test("issuelinks and parent become links for one-hop expansion", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          issues: [
            issue("X-1", {
              issuelinks: [{ type: { name: "Implements" }, outwardIssue: { key: "X-2" } }, { type: { name: "Blocks" }, inwardIssue: { key: "X-3" } }],
              parent: { key: "X-0" },
            }),
          ],
          isLast: true,
        }),
        { status: 200 },
      )) as typeof fetch;
    const provider = new JiraProvider({ baseUrl: "https://example.atlassian.net", email: "a@b.com", apiToken: "tok", fetchImpl });

    const { matches } = await provider.runQuery("q", 10);
    const links = matches[0]?.links ?? [];

    expect(links).toContainEqual({ targetId: "jira-work:X-2", kind: "implements" });
    expect(links).toContainEqual({ targetId: "jira-work:X-3", kind: "blocks" });
    expect(links).toContainEqual({ targetId: "jira-work:X-0", kind: "parent" });
  });

  test("truncation: requesting cap+1 and getting more than cap back marks truncated, matched is capped", async () => {
    const fetchImpl = (async (url: string | URL) => {
      // the endpoint reports no total — the provider must request cap+1 itself to detect this
      expect(String(url)).toContain("maxResults=3");
      return new Response(JSON.stringify({ issues: [issue("X-1"), issue("X-2"), issue("X-3")], isLast: false }), { status: 200 });
    }) as typeof fetch;
    const provider = new JiraProvider({ baseUrl: "https://example.atlassian.net", email: "a@b.com", apiToken: "tok", fetchImpl });

    const { matches, truncated } = await provider.runQuery("q", 2);

    expect(truncated).toBe(true);
    expect(matches).toHaveLength(2);
  });

  test("exactly cap results is NOT truncated", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ issues: [issue("X-1"), issue("X-2")], isLast: true }), { status: 200 })) as typeof fetch;
    const provider = new JiraProvider({ baseUrl: "https://example.atlassian.net", email: "a@b.com", apiToken: "tok", fetchImpl });

    const { matches, truncated } = await provider.runQuery("q", 2);

    expect(truncated).toBe(false);
    expect(matches).toHaveLength(2);
  });

  test("a non-ok response throws with the status in the message", async () => {
    const fetchImpl = (async () => new Response("unauthorized", { status: 401, statusText: "Unauthorized" })) as typeof fetch;
    const provider = new JiraProvider({ baseUrl: "https://example.atlassian.net", email: "a@b.com", apiToken: "tok", fetchImpl });

    await expect(provider.runQuery("q", 10)).rejects.toThrow(/401/);
  });
});

describe("JiraProvider.fetchById", () => {
  test("fetches a single issue by canonical id via GET /rest/api/3/issue/<key>", async () => {
    let calledUrl = "";
    const fetchImpl = (async (url: string | URL) => {
      calledUrl = String(url);
      return new Response(JSON.stringify(issue("X-9")), { status: 200 });
    }) as typeof fetch;
    const provider = new JiraProvider({ baseUrl: "https://example.atlassian.net", email: "a@b.com", apiToken: "tok", fetchImpl });

    const match = await provider.fetchById("jira-work:X-9");

    expect(calledUrl).toContain("/rest/api/3/issue/X-9");
    expect(match?.id).toBe("jira-work:X-9");
  });

  test("returns null for an id with a different provider prefix, without calling fetch", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const provider = new JiraProvider({ baseUrl: "https://example.atlassian.net", email: "a@b.com", apiToken: "tok", fetchImpl });

    const match = await provider.fetchById("github:owner/repo/pull/1");

    expect(match).toBeNull();
    expect(called).toBe(false);
  });

  test("returns null on a 404 rather than throwing", async () => {
    const fetchImpl = (async () => new Response("not found", { status: 404 })) as typeof fetch;
    const provider = new JiraProvider({ baseUrl: "https://example.atlassian.net", email: "a@b.com", apiToken: "tok", fetchImpl });

    const match = await provider.fetchById("jira-work:X-404");

    expect(match).toBeNull();
  });
});
