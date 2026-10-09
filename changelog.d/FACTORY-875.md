bump: minor

### Added
- `/graph.json` now serves LIVE Jira data on every request (`src/server/graph-cache.ts`), instead of a static file: an in-process cache with TTL `refreshSeconds` (new config field, default 30, minimum 15 — rejected below it), and single-flight so concurrent requests during an in-progress collection share one collector run.
- Stale fallback: on any Jira failure, the last good snapshot is served with `stale: true`, `staleSince`, and a short credential-sanitised `error`. When no collection has ever succeeded, the committed fixture is served instead, marked `usingFixture: true`.
- `GraphSchema` gained optional live-serving fields: `stale`, `staleSince`, `error`, `usingFixture`, `refreshSeconds` — a plain collector-produced snapshot stays valid without them.
- `src/server/sanitize-error.ts`: redacts configured credential values (plus defensive Basic/Bearer header patterns) from any error before it can reach a response body or a log line.
- The viewer (`public/app.js`) now polls `/graph.json` on a timer matching the response's `refreshSeconds` and updates nodes/edges/colours IN PLACE by id, preserving each existing node's force-layout position (no restart, no jump); added/removed nodes are diffed in incrementally. A banner shows `live as of HH:MM:SS` or `STALE since HH:MM:SS` (or a distinct message when serving the fixture).
- `public/style.css`: named theme tokens `--edge`, `--arrowhead`, `--node-stroke` (plus a full light palette — previously dark-only), switched via `prefers-color-scheme`. `test/contrast.test.ts` computes their WCAG contrast ratio against `--bg` from the actual CSS and fails below 4.5:1. Computed: light `#4c4f69` vs `#eff1f5` = 7.06:1; dark `#cdd6f4` vs `#1e1e2e` = 11.34:1.
- Edges now render arrowheads (an SVG marker), previously absent entirely.

### Changed
- `bun run seer` (serve) now requires `JIRA_BASE_URL`/`JIRA_EMAIL`/`JIRA_API_TOKEN` to show live data; without them, or before any collection has ever succeeded, it serves the committed fixture and says so in both the response and the UI.
