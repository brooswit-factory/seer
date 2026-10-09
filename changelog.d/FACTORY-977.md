bump: minor

### Changed
- The collector (`src/collector/collect.ts`) now draws a `contains` edge from each `jira-project:<KEY>` node to every non-Done Bug of that project in the graph, not just its Epics — every Bug is a member of its project by Jira membership, so no Bug is excluded for lacking an Epic link; a Bug that still carries its own Implements link to an Epic keeps it unchanged. Stories/Tasks are never targeted this way, same as before.
- The project legend row (`public/app.js`) now reads "contains (project → Epics and Bugs)".
- `epicCountForProject`'s tooltip count (`public/app.js`) now filters `contains` edges by the target node's own `resourceType === "Epic"`, since `contains` can target a Bug too and the tooltip field is specifically "number of Epics".

### Notes
- Policy: pushed for CI per ticket instructions; local `bun test`/typecheck not run here.
