# seer

seer ("see-er, one who sees") is the butchr resource graph: given a config of
(machine, butchr user) pairs and the queries each one runs, it will render a
D3 graph of every matched resource plus everything it links to, coloured by
the resource's agent status and grouped into hulls by the (machine, user)
pair it sits under.

This repo (seer S1, FACTORY-853/FACTORY-859) is the project skeleton: one
install command, minimal CI, the two data contracts every later story writes
against — the config schema and the graph-JSON schema — their loader and
validator, and a small committed fixture. It deliberately does **not**
implement query execution, link expansion, status reading, colour mapping,
or any D3 rendering — that is FACTORY-855's MVP vertical slice.

## What exists now vs. later

- **Now (this repo):** the config shape + loader/validator, the graph-JSON
  shape + validator, a fake fixture, and the public import path. You can
  install and typecheck/test this repo; there is nothing to *run* yet.
- **Later (FACTORY-855):** actually executing each source's queries against
  its provider, expanding links one hop, reading `agent:*` status labels off
  the provider's own resources, applying the colour table, rendering the D3
  force graph, and serving it from one command on localhost.
- **Deliberately deferred past the MVP (FACTORY-841's LATER list):** reaching
  each machine's own butchr daemon (seer never contacts a butchr daemon — see
  below), a refresh/poll loop, filtering/search/saved layouts, and
  cross-platform packaging beyond one install command.

## Install

```
bun install
```

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

The planned node-colour table (herdr's status→hex mapping) is recorded in
FACTORY-841's DECISIONS comment; this repo does not implement it.

## The schemas

Both are exported from a single public entry point, `src/index.ts`, so later
stories import types rather than redeclaring them.

- **Config schema** (`src/config/schema.ts`, loader in `src/config/loader.ts`):
  parses and validates seer's own config file — `sources[]` (each a stable
  id, machine, user, display name, and queries), a link-expansion depth
  (`linkDepth`, default 1), and a `port`. Duplicate source ids are rejected.
  Invalid config throws a `ConfigError` naming the offending field path —
  never a silent default, never a raw stack trace.

- **Graph JSON schema** (`src/graph/schema.ts`, validator in
  `src/graph/validate.ts`): the artifact the (future) collector writes and
  the (future) viewer reads. Per node: a canonical provider-qualified id,
  provider, label, URL, owning source id (`ownerSourceId`, for hull
  grouping), one of butchr's five `agent:*` statuses
  (`working | idle | blocked | stalled | none`), whether the provider is even
  capable of reporting status (`providerCanReportStatus` — distinguishes
  "cannot report" from "reports none"), and whether an admission-withheld
  marker is present. Per edge: source id, target id, and a small closed
  `kind` enum (`implements | blocks | relates | parent | link`); edges must
  reference existing node ids. Top-level: a schema version, an ISO-8601
  snapshot timestamp, the nodes and edges, and a per-query record
  (`sourceId`, `provider`, `query`, `matched` count, `error`) so a failed
  query stays distinguishable from a zero-match one.

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
