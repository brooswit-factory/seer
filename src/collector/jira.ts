import type { AgentStatus, EdgeKind } from "../graph/schema.ts";
import type { Provider, ProviderLink, ProviderMatch } from "./types.ts";

const AGENT_STATUS_LABELS: Record<string, AgentStatus> = {
  "agent:working": "working",
  "agent:idle": "idle",
  "agent:blocked": "blocked",
  "agent:stalled": "stalled",
  "agent:none": "none",
};

const ADMISSION_WITHHELD_LABEL = "admission:withheld";

interface JiraIssueLinkType {
  name: string;
}
interface JiraIssueLink {
  type: JiraIssueLinkType;
  inwardIssue?: { key: string };
  outwardIssue?: { key: string };
}
interface JiraIssueFields {
  summary: string;
  labels?: string[];
  issuelinks?: JiraIssueLink[];
  parent?: { key: string };
  issuetype?: { name: string };
}
interface JiraIssue {
  key: string;
  fields: JiraIssueFields;
}
/**
 * Jira Cloud's CURRENT search endpoint, `GET /rest/api/3/search/jql` — the older `POST
 * /rest/api/3/search` this provider originally called no longer exists on Jira Cloud (verified
 * against butchr's own working client, src/atlassian/client.ts, in a butchr checkout). This
 * shape carries no `total` count, only `issues` plus pagination fields — truncation here is
 * therefore determined by requesting one more than the cap and checking whether that many came
 * back (see `search` below), not by comparing against a total.
 */
interface JiraSearchResponse {
  issues: JiraIssue[];
  isLast?: boolean;
  nextPageToken?: string;
}

function edgeKindForLinkType(name: string): EdgeKind {
  const normalized = name.toLowerCase();
  if (normalized.includes("implement")) return "implements";
  if (normalized.includes("block")) return "blocks";
  return "relates";
}

export interface JiraProviderOptions {
  baseUrl: string;
  email: string;
  apiToken: string;
  /** Defaults to "jira-work" to match this fleet's convention for the canonical id prefix. */
  providerKey?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Reads butchr's standardized `agent:*` status labels straight off Jira issues — the provider
 * writes them onto the issue itself (FACTORY-841 comment 31140), so this needs only a Jira
 * credential, never a butchr daemon.
 */
export class JiraProvider implements Provider {
  readonly name: string;
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: JiraProviderOptions) {
    this.name = options.providerKey ?? "jira-work";
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.authHeader = `Basic ${Buffer.from(`${options.email}:${options.apiToken}`).toString("base64")}`;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private canonicalId(key: string): string {
    return `${this.name}:${key}`;
  }

  private issueUrl(key: string): string {
    return `${this.baseUrl}/browse/${key}`;
  }

  private toMatch(issue: JiraIssue): ProviderMatch {
    const labels = issue.fields.labels ?? [];
    let agentStatus: AgentStatus = "none";
    for (const label of labels) {
      const mapped = AGENT_STATUS_LABELS[label];
      if (mapped) {
        agentStatus = mapped;
        break;
      }
    }
    const admissionWithheld = labels.includes(ADMISSION_WITHHELD_LABEL);

    const links: ProviderLink[] = [];
    for (const link of issue.fields.issuelinks ?? []) {
      const linkedKey = link.inwardIssue?.key ?? link.outwardIssue?.key;
      if (!linkedKey) continue;
      links.push({ targetId: this.canonicalId(linkedKey), kind: edgeKindForLinkType(link.type.name) });
    }
    if (issue.fields.parent) {
      links.push({ targetId: this.canonicalId(issue.fields.parent.key), kind: "parent" });
    }

    return {
      id: this.canonicalId(issue.key),
      provider: this.name,
      label: `${issue.key}: ${issue.fields.summary}`,
      url: this.issueUrl(issue.key),
      agentStatus,
      providerCanReportStatus: true,
      admissionWithheld,
      ...(issue.fields.issuetype?.name !== undefined ? { resourceType: issue.fields.issuetype.name } : {}),
      links,
    };
  }

  private async search(jql: string, maxResults: number): Promise<JiraSearchResponse> {
    const params = new URLSearchParams({
      jql,
      maxResults: String(maxResults),
      fields: "summary,labels,issuelinks,parent,issuetype",
    });
    const url = `${this.baseUrl}/rest/api/3/search/jql?${params}`;
    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: { authorization: this.authHeader, accept: "application/json" },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Jira search failed (${response.status} ${response.statusText}): ${body.slice(0, 500)}`);
    }
    return (await response.json()) as JiraSearchResponse;
  }

  /** Requests `cap + 1` so a result of more than `cap` is distinguishable from exactly `cap` — the endpoint reports no total count to compare against. */
  async runQuery(query: string, cap: number): Promise<{ matches: ProviderMatch[]; truncated: boolean }> {
    const result = await this.search(query, cap + 1);
    const truncated = result.issues.length > cap;
    const issues = truncated ? result.issues.slice(0, cap) : result.issues;
    return { matches: issues.map((issue) => this.toMatch(issue)), truncated };
  }

  async fetchById(id: string): Promise<ProviderMatch | null> {
    const prefix = `${this.name}:`;
    if (!id.startsWith(prefix)) return null;
    const key = id.slice(prefix.length);
    const url = `${this.baseUrl}/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,labels,issuelinks,parent,issuetype`;
    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: { authorization: this.authHeader, accept: "application/json" },
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Jira issue fetch failed (${response.status} ${response.statusText}): ${body.slice(0, 500)}`);
    }
    const issue = (await response.json()) as JiraIssue;
    return this.toMatch(issue);
  }
}
