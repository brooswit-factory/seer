import type { AgentStatus, EdgeKind, JiraStatus } from "../graph/schema.ts";

export interface ProviderLink {
  targetId: string;
  kind: EdgeKind;
}

export interface ProviderMatch {
  /** Canonical provider-qualified id, e.g. "jira-work:FACTORY-841". */
  id: string;
  provider: string;
  label: string;
  url: string;
  agentStatus: AgentStatus;
  providerCanReportStatus: boolean;
  admissionWithheld: boolean;
  /** The kind of resource this is, e.g. a Jira issue type name, or a non-Jira provider's own value. Optional — absent means "other/unknown" to the viewer. */
  resourceType?: string;
  /** The resource's Jira workflow status, name + category. Optional — absent on a non-Jira provider's match. */
  jiraStatus?: JiraStatus;
  links: ProviderLink[];
}

export interface Provider {
  name: string;
  /** Run `query` and return up to `cap` matches. `truncated` is true when more than `cap` results actually exist — Jira's current search API (`/rest/api/3/search/jql`) returns no total count, so a provider determines this itself (e.g. by requesting `cap + 1` and checking whether that many came back), not the caller. Throws on a provider-level failure (bad credentials, network, malformed query). */
  runQuery(query: string, cap: number): Promise<{ matches: ProviderMatch[]; truncated: boolean }>;
  /** Fetch a single resource by its canonical id, for one-hop link expansion. Returns null if this provider cannot resolve that id. */
  fetchById(id: string): Promise<ProviderMatch | null>;
}
