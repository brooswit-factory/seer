import { describe, expect, test } from "bun:test";
import { nodeInfoHtml, escapeHtml } from "../public/node-info.js";

describe("nodeInfoHtml (FACTORY-957: shared content-builder for hover tooltip AND the right-panel node-info view)", () => {
  test("regular node: label, provider, id, type, jira status, status, discovery, link — same fields/order as the pre-FACTORY-957 tooltip", () => {
    const node = {
      id: "jira-work:FACTORY-859",
      label: "seer: viewer polish",
      provider: "jira-work",
      url: "https://example.atlassian.net/browse/FACTORY-859",
      resourceType: "Task",
      jiraStatus: { name: "In Review", category: "indeterminate" as const },
      agentStatus: "working" as const,
      providerCanReportStatus: true,
      discovery: "query" as const,
    };
    const html = nodeInfoHtml(node);
    const order = ["label", "provider", "id", "type", "jira status", "status", "discovery", "link"];
    let lastIndex = -1;
    for (const field of order) {
      const idx = html.indexOf(`<dt>${field}</dt>`);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
    expect(html).toContain("seer: viewer polish");
    expect(html).toContain("jira-work:FACTORY-859");
    expect(html).toContain("In Review");
    expect(html).toContain("query hit");
    expect(html).toContain(node.url);
  });

  test("a node with no resourceType reports 'unknown' type, never throws", () => {
    const node = {
      id: "x:1",
      label: "l",
      provider: "x",
      url: "https://example.com",
      agentStatus: "none" as const,
      providerCanReportStatus: false,
      discovery: "link" as const,
    };
    expect(nodeInfoHtml(node)).toContain("<dt>type</dt><dd>unknown</dd>");
  });

  test("a link-discovered node reports 'link-discovered', not 'query hit'", () => {
    const node = {
      id: "x:1",
      label: "l",
      provider: "x",
      url: "https://example.com",
      agentStatus: "none" as const,
      providerCanReportStatus: false,
      discovery: "link" as const,
    };
    expect(nodeInfoHtml(node)).toContain("link-discovered");
  });

  test("a project node (FACTORY-911) gets the project/epics/link dl, never the ticket dl", () => {
    const projectNode = { id: "jira-project:P1", label: "My Project", provider: "jira-project", url: "https://example.com/proj" };
    const html = nodeInfoHtml(projectNode, { epicCount: 7 });
    expect(html).toContain("<dt>project</dt>");
    expect(html).toContain("<dt>epics</dt><dd>7</dd>");
    expect(html).not.toContain("<dt>provider</dt>");
    expect(html).not.toContain("<dt>jira status</dt>");
  });

  test("project node epicCount defaults to 0 when not supplied", () => {
    const projectNode = { id: "jira-project:P1", label: "My Project", provider: "jira-project", url: "https://example.com/proj" };
    expect(nodeInfoHtml(projectNode)).toContain("<dt>epics</dt><dd>0</dd>");
  });

  test("HTML-escapes label and url", () => {
    const node = {
      id: "x:1",
      label: `<script>alert(1)</script>`,
      provider: "x",
      url: "https://example.com?a=1&b=2",
      agentStatus: "none" as const,
      providerCanReportStatus: false,
      discovery: "link" as const,
    };
    const html = nodeInfoHtml(node);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("escapeHtml", () => {
  test("escapes the five XML-significant characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});
