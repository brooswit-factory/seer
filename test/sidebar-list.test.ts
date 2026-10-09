import { describe, expect, test } from "bun:test";
import { sortNodesForSidebar, filterNodesForSidebar } from "../public/sidebar-list.js";

function node(id: string, resourceType?: string, provider = "jira-work") {
  return { id, label: id, provider, resourceType };
}

describe("sortNodesForSidebar (FACTORY-957 item 1)", () => {
  test("orders by type tier: Epic, Story, Task, Bug, others, projects — then by id within a tier", () => {
    const nodes = [
      node("jira-work:TASK-2", "Task"),
      node("jira-project:PROJ", "project", "jira-project"),
      node("jira-work:BUG-1", "Bug"),
      node("jira-work:EPIC-1", "Epic"),
      node("jira-work:SUB-1", "Sub-task"),
      node("jira-work:STORY-1", "Story"),
      node("github:gh-1", "pull-request", "github"),
      node("jira-work:TASK-1", "Task"),
    ];
    const sorted = sortNodesForSidebar(nodes).map((n) => n.id);
    expect(sorted).toEqual([
      "jira-work:EPIC-1",
      "jira-work:STORY-1",
      "jira-work:TASK-1",
      "jira-work:TASK-2",
      "jira-work:BUG-1",
      "github:gh-1",
      "jira-work:SUB-1",
      "jira-project:PROJ",
    ]);
  });

  test("an unrecognized/missing resourceType lands in the 'others' tier, not 'unknown crashes'", () => {
    const nodes = [node("jira-work:X-1", undefined), node("jira-work:EPIC-1", "Epic")];
    expect(sortNodesForSidebar(nodes).map((n) => n.id)).toEqual(["jira-work:EPIC-1", "jira-work:X-1"]);
  });

  test("does not mutate the input array", () => {
    const nodes = [node("b", "Task"), node("a", "Task")];
    const original = [...nodes];
    sortNodesForSidebar(nodes);
    expect(nodes).toEqual(original);
  });
});

describe("filterNodesForSidebar (FACTORY-957 item 1: text filter box)", () => {
  const nodes = [
    { id: "jira-work:FACTORY-859", label: "seer: viewer polish" },
    { id: "jira-work:FACTORY-900", label: "node size + colour overhaul" },
    { id: "github:pr-42", label: "Bump dependency" },
  ];

  test("empty query matches everything", () => {
    expect(filterNodesForSidebar(nodes, "")).toBe(nodes);
    expect(filterNodesForSidebar(nodes, "   ")).toBe(nodes);
  });

  test("matches against id (the sidebar's 'key'), case-insensitively", () => {
    expect(filterNodesForSidebar(nodes, "factory-859").map((n) => n.id)).toEqual(["jira-work:FACTORY-859"]);
  });

  test("matches against label, case-insensitively", () => {
    expect(filterNodesForSidebar(nodes, "VIEWER").map((n) => n.id)).toEqual(["jira-work:FACTORY-859"]);
  });

  test("substring match, not exact/prefix-only", () => {
    expect(filterNodesForSidebar(nodes, "colour").map((n) => n.id)).toEqual(["jira-work:FACTORY-900"]);
  });

  test("no match -> empty array", () => {
    expect(filterNodesForSidebar(nodes, "nonexistent")).toEqual([]);
  });
});
