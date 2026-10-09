bump: minor

### Added
- The seer MVP, end to end: a one-command localhost viewer, a Jira collector, and the D3 force graph.
- `bun run seer` starts a loopback-only HTTP server and opens the browser — no bundler, no build step. Falls back to the committed fixture when no `graph.json` exists yet.
- `bun run seer collect [config]` runs every source's Jira queries, expands links one hop, dedupes, and writes `graph.json` atomically.
- Plain static D3 viewer (`public/`): one hull per (machine, user) source (drawn even for a single-node source), the herdr-verified status colour table, a legend, hover/click tooltips, and a query panel that visibly distinguishes a failed query from a zero-match one and labels truncated results.
- `GraphNodeSchema.discovery` ("query" | "link"): marks whether a node matched a source's query directly or was only reached by link expansion, per FACTORY-855 item 3.
- `QueryRecordSchema.truncated` and `SeerConfigSchema.resultCap`: a plain per-query result cap, labelled in the output when it kicks in.

### Fixed
- `parseGraph` now returns the schema-validated object (defaults applied) instead of casting the raw input.
- The Jira provider now calls `GET /rest/api/3/search/jql` (Jira Cloud's current endpoint) instead of the removed `POST /rest/api/3/search`, and derives `truncated` by requesting `cap + 1` results rather than reading a `total` field the new endpoint doesn't return.

### Changed
- `fixtures/graph.example.json` gained a `discovery` value on every node (derived from which query actually matched it) and `truncated: false` on every query record, to stay valid under the schema additions above.
