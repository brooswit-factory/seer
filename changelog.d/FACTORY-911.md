bump: minor

### Added
- The Jira collector now requests the issue `project` field (key + name, both on search and single-issue fetch) and synthesises one node per distinct Jira project that has at least one ticket node in the graph: `id: "jira-project:<KEY>"`, `provider: "jira-project"`, `resourceType: "project"`, `label: "<KEY> <project name>"`, the project's own browse URL, no `agentStatus`/`jiraStatus` of its own.
- A new `contains` `EdgeKind`: one edge from each project node to every Epic of that project already present in the graph (query- or link-discovered alike); deduped, deterministic.
- `public/project.js`: the project node's own fixed shape (`wye`), fixed fill colour (both themes, verified >= 3:1 against `--bg`), and `PROJECT_SIZE`/`PROJECT_LINK_DISTANCE` constants — a project node is never sized by `SEER_SIZE_BASE`/`SEER_SIZE_ACTIVE`, never draws an agent-status ring, and its `contains` edges use a tighter link distance so its Epics cluster near it.
- The sidebar legend gained a "Project" row (shape/colour + `contains` line style); the tooltip shows a project's key/name and its Epic count instead of the usual ticket fields.
- `.edge.contains` (style.css): lighter/thinner than a ticket link, still >= 3:1 against `--bg` in both themes.

### Changed
- `GraphEdgeSchema`'s `EdgeKindSchema` gained `"contains"` — additive, old graphs still validate.
