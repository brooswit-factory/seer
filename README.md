# seer

seer ("see-er, one who sees") is the butchr resource graph: given a config of
(machine, butchr user) pairs and the queries each one runs, it will render a
D3 graph of every matched resource plus everything it links to, coloured by
the resource's agent status and grouped into hulls by the (machine, user)
pair it sits under.

seer ships the MVP vertical slice (FACTORY-855/FACTORY-869) plus live serving
(FACTORY-875): the config and graph-JSON schemas (FACTORY-853), a Jira
collector, and a D3 viewer that polls a live, cached `/graph.json` on
localhost.

## What exists now vs. later

- **Now:** the config + graph-JSON schemas and their loader/validator, a Jira
  collector (query execution, one-hop link expansion, dedupe, atomic
  snapshot write), a plain D3 viewer (hulls per source, herdr colours,
  legend, tooltip, failed/truncated query indication, a live/stale banner),
  and `bun run seer` (serve — collects LIVE from Jira on every request,
  cached and single-flighted) / `bun run seer collect` (one-off snapshot to
  `graph.json`, independent of the server's own cache).
- **Deliberately deferred (FACTORY-841's LATER list):** reaching each
  machine's own butchr daemon (seer never contacts a butchr daemon — see
  below), filtering/search/saved layouts, GitHub as a provider, and
  cross-platform packaging beyond one install command.

## Install & run

```
bun install
JIRA_BASE_URL=https://yoursite.atlassian.net JIRA_EMAIL=you@example.com JIRA_API_TOKEN=... \
  bun run seer            # serves the viewer on localhost and opens the browser
```

`bun run seer` now serves `/graph.json` LIVE: each request (subject to the
cache below) runs the Jira collector configured by
`fixtures/seer.config.example.json` (or `SEER_CONFIG`-adjacent conventions —
see `src/cli.ts`). Without `JIRA_BASE_URL`/`JIRA_EMAIL`/`JIRA_API_TOKEN` set,
or before any collection has ever succeeded, the viewer falls back to the
committed fixture and says so (`usingFixture: true` in the graph JSON, a
banner in the UI) — the one command always shows something.

To write a one-off snapshot file instead (unrelated to the live server's own
cache):

```
JIRA_BASE_URL=https://yoursite.atlassian.net JIRA_EMAIL=you@example.com JIRA_API_TOKEN=... \
  bun run seer collect fixtures/seer.config.example.json
```

## Live serving, caching, and staleness (FACTORY-875)

- **Cache + single-flight** (`src/server/graph-cache.ts`): `/graph.json` is
  served from an in-process cache with a TTL of the config's
  `refreshSeconds` (default 30, minimum 15 — rejected, not clamped, below
  that). Concurrent requests during an in-progress collection share the
  SAME collector run rather than each starting their own.
- **Stale fallback:** on ANY Jira failure, the last good snapshot is served
  with `stale: true`, `staleSince` (when that snapshot was collected), and a
  short, credential-sanitised `error`. The viewer shows a `STALE since
  HH:MM:SS` banner; a fresh response shows `live as of HH:MM:SS`. If no
  collection has EVER succeeded, the committed fixture is served instead,
  marked `usingFixture: true`.
- **The viewer polls**, not just loads once: `public/app.js` re-fetches
  `/graph.json` on a timer matching the response's own `refreshSeconds`, and
  updates nodes/edges/colours IN PLACE by id — existing nodes keep their
  force-layout position (no jump, no layout reset); added/removed nodes are
  diffed in incrementally, and the simulation is only gently reheated
  (`alpha`, not restarted) when the node/edge set actually changed.
- **Credentials never leave the process:** `JIRA_BASE_URL`/`JIRA_EMAIL`/
  `JIRA_API_TOKEN` are read from the environment only (e.g. a systemd
  `EnvironmentFile`), never from config JSON, never sent to the browser.
  Every collection failure is passed through
  `src/server/sanitize-error.ts` before it can reach a response body or a
  log line — see `test/serve.test.ts` and `test/graph-cache.test.ts` for the
  assertion that a credential value never appears in a served response.
- **Theme tokens + contrast** (`public/style.css`): edges, arrowheads, and
  node strokes are drawn from three named CSS custom properties (`--edge`,
  `--arrowhead`, `--node-stroke`), defined separately for light (default)
  and dark (`prefers-color-scheme: dark`) themes. `test/contrast.test.ts`
  reads those values straight out of `style.css` and computes their WCAG
  contrast ratio against `--bg`, failing below 4.5:1. Computed ratios as of
  this change: light theme `#4c4f69` vs `#eff1f5` = **7.06:1**; dark theme
  `#cdd6f4` vs `#1e1e2e` = **11.34:1**.

## The viewer

`public/` is a plain static page (D3 loaded from a CDN `<script>` tag, no
bundler): `index.html`, `app.js` (the force-directed graph, hulls, tooltip,
legend, query panel), `colors.js` (the ONE herdr-verified status→colour
table, also imported directly by `test/colors.test.ts`), and
`query-status.js` (classifies a query record as ok / zero-match / failed /
truncated — also imported directly by its test).

**Shared-node attribution decision** (FACTORY-855 item 3): when the same
resource is reached by more than one source, a direct query hit always wins
over a link-discovery, regardless of which source found it; if two sources'
queries both match it directly, whichever source is listed first in the
config keeps it. See `src/collector/collect.ts`'s `upsertNode`.

## Settled decisions

(From FACTORY-841's DECISIONS comment and its later SCOPE CORRECTION —
summarized here so a reader of this repo doesn't have to find the Jira
comments.)

- **Repo placement.** seer is its own repo, in the same GitHub org butchr
  lives in — not folded into the butchr repo.
- **Input source: config, not the butchr HTTP API — and no butchr daemon at
  all.** butchr writes its `agent:*` status labels onto the *provider's own
  resource* (e.g. the Jira ticket), not into daemon-local state, so anything
  with provider read access can see every machine's agent status with one
  credential. seer's own config lists `sources[]`, each one (machine, butchr
  user) pair with a display name and a list of `{ provider, query }` entries
  mirroring a butchr rule's own `resourceProvider` + `query` fields. seer
  executes those queries itself, under its own single set of provider
  credentials — it never contacts another host's butchr daemon.
- **Hosting: loopback only.** The config's `port` field is for a future local
  HTTP server; there is deliberately no `host` field, so nothing in the
  config can express a non-loopback bind.
- **The `currentUser()` trap.** A butchr rule is commonly written as
  `assignee = currentUser()` (see butchr's `docs/rules.example.json`), but
  seer runs every source's queries under ONE credential — copying that
  verbatim would make `currentUser()` resolve to *seer's own* account for
  every source, silently collapsing every bubble onto one identical set of
  nodes. The config loader therefore **refuses** any query containing
  `currentUser()` (case-insensitive, tolerant of whitespace before the
  parens), naming the offending `sources.<i>.queries.<j>.query` path and
  telling the author to name their user explicitly (an accountId or
  username) instead.

The node-colour table (herdr's status→hex mapping, FACTORY-841 decision 5) is
implemented in `public/colors.js` — verified against herdr's own
`status_color` function and its default Catppuccin Mocha palette in a
herdrdev/herdr checkout; herdr has no `stalled` counterpart at all, which is
why that one entry is seer/butchr's own decision rather than a herdr value.

## The schemas

Both are exported from a single public entry point, `src/index.ts`, so other
code imports types rather than redeclaring them.

- **Config schema** (`src/config/schema.ts`, loader in `src/config/loader.ts`):
  parses and validates seer's own config file — `sources[]` (each a stable
  id, machine, user, display name, and queries), a link-expansion depth
  (`linkDepth`, default 1), a per-query result cap (`resultCap`, default 50),
  a `port`, and `refreshSeconds` (the live `/graph.json` cache TTL and viewer
  poll interval; default 30, rejected below a minimum of 15). Duplicate
  source ids are rejected. Invalid config throws a `ConfigError` naming the
  offending field path — never a silent default, never a raw stack trace.

- **Graph JSON schema** (`src/graph/schema.ts`, validator in
  `src/graph/validate.ts`): the artifact the collector writes and the viewer
  reads. Per node: a canonical provider-qualified id, provider, label, URL,
  owning source id (`ownerSourceId`, for hull grouping), one of butchr's five
  `agent:*` statuses (`working | idle | blocked | stalled | none`), whether
  the provider is even capable of reporting status
  (`providerCanReportStatus` — distinguishes "cannot report" from "reports
  none"), whether an admission-withheld marker is present, and `discovery`
  (`"query" | "link"` — whether a source's query matched this node directly
  or it was only reached by link expansion). Per edge: source id, target id,
  and a small closed `kind` enum (`implements | blocks | relates | parent |
  link`); edges must reference existing node ids. Top-level: a schema
  version, an ISO-8601 snapshot timestamp, the nodes and edges, a per-query
  record (`sourceId`, `provider`, `query`, `matched` count, `error`,
  `truncated`) so a failed query stays distinguishable from a zero-match
  one, and (FACTORY-875, all optional so a plain collector snapshot stays
  valid without them) the live-serving fields `stale`, `staleSince`,
  `error`, `usingFixture`, and `refreshSeconds` — see `src/server/graph-cache.ts`,
  the one place that always sets every one of them on what it actually
  serves.

## Fixture

`fixtures/graph.example.json` is a committed, schema-valid example graph
(~10-15 nodes): at least two (machine, user) sources, a provider that cannot
report agent status, all five agent-status values, an admission-withheld
node, a failed query record, and a zero-match query record.
`fixtures/seer.config.example.json` is a matching example config, with every
query naming its user explicitly (no `currentUser()`).

## Public import path

`src/index.ts` (via `package.json`'s `exports`/`main`) re-exports the config
and graph types, the config loader, and the graph validator — the one
import path later stories use.

## Stack

TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
ESM, `moduleResolution: bundler`) on Bun, matching butchr's own tooling.
`bun install`, `bun run typecheck`, `bun test`. No build step, no linter. The
eventual viewer (FACTORY-855) is a plain static page with no bundler, so this
repo keeps `src/` free of Bun-only APIs where that's cheap, to keep a Node
fallback a small change rather than a rewrite.
