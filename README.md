# seer

seer ("see-er, one who sees") is the butchr resource graph: given a config of
(machine, butchr user) pairs and the queries each one runs, it will render a
D3 graph of every matched resource plus everything it links to, coloured by
the resource's agent status and grouped into hulls by the (machine, user)
pair it sits under.

seer ships the MVP vertical slice (FACTORY-855/FACTORY-869): the config and
graph-JSON schemas (FACTORY-853), a Jira collector, and a plain static D3
viewer served by one command on localhost.

## What exists now vs. later

- **Now:** the config + graph-JSON schemas and their loader/validator, a Jira
  collector (query execution, one-hop link expansion, dedupe, atomic
  snapshot write), a plain static D3 viewer (hulls per source, herdr colours,
  legend, tooltip, failed/truncated query indication), and `bun run seer`
  (serve) / `bun run seer collect` (snapshot).
- **Deliberately deferred past the MVP (FACTORY-841's LATER list):** reaching
  each machine's own butchr daemon (seer never contacts a butchr daemon — see
  below), a refresh/poll loop, filtering/search/saved layouts, GitHub as a
  provider, and cross-platform packaging beyond one install command.

## Install & run

```
bun install
bun run seer            # serves the viewer on localhost and opens the browser
```

With no `graph.json` yet, the viewer falls back to the committed fixture so
the one command always shows something. To collect a real snapshot from
Jira:

```
JIRA_BASE_URL=https://yoursite.atlassian.net JIRA_EMAIL=you@example.com JIRA_API_TOKEN=... \
  bun run seer collect fixtures/seer.config.example.json
bun run seer
```

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
  and a `port`. Duplicate source ids are rejected. Invalid config throws a
  `ConfigError` naming the offending field path — never a silent default,
  never a raw stack trace.

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
  version, an ISO-8601 snapshot timestamp, the nodes and edges, and a
  per-query record (`sourceId`, `provider`, `query`, `matched` count,
  `error`, `truncated`) so a failed query stays distinguishable from a
  zero-match one, and a capped result stays labelled as capped.

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
