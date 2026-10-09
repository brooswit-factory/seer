bump: minor

### Added
- `GraphNodeSchema.resourceType`: an OPTIONAL string naming the kind of resource a node is (a Jira issue type name, or a non-Jira provider's own value). Absent on old `graph.json` data and the committed fixture, which still validate.
- The Jira collector now requests `issuetype` and populates `resourceType` with the issue type name.
- The viewer draws a distinct D3 symbol shape per resource type (`public/shapes.js`): Epic = hexagon, Story = square, Task = circle, Bug = triangle, Sub-task = diamond, unknown/other Jira type = rounded square, any non-Jira provider = star — with a size tier per type (Epic largest, Sub-task smallest). Fill stays the agent-status colour from `colors.js`, unchanged; type is never encoded in hue.
- A sidebar legend showing type → shape alongside the existing status → colour legend, correct in both light and dark themes.
- `--shape-stroke` CSS theme tokens (dark and `prefers-color-scheme: light`) and `public/contrast.js`, a small WCAG contrast-ratio calculator verifying those tokens meet >= 4.5:1 against the canvas background in both themes.
