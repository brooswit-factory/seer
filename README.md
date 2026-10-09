# seer

seer ("see-er, one who sees") is the butchr resource graph: given a list of
butchr users and all of their butchr queries, it renders a D3 graph of every
matched resource plus everything it links to, coloured by the resource's
agent status and grouped into hulls by the butchr user it sits under.

This repo (seer S1, FACTORY-853/FACTORY-859) builds the project skeleton, CI,
and the two data contracts every later story writes against — the config
schema and the graph-JSON schema — plus a realistic committed fixture. It
deliberately does **not** implement query execution, link expansion, status
reading, colour mapping, or any D3 rendering; those are later stories
(FACTORY-855, FACTORY-857, FACTORY-858, FACTORY-860).

## The epic's four settled decisions

(FACTORY-841's DECISIONS comment is the binding design contract; summarized
here so a reader of this repo doesn't have to find a Jira comment.)

1. **Repo placement.** seer is its own repo, in the same GitHub org butchr
   lives in — not folded into the butchr repo.
2. **Input source: config, not the butchr HTTP API.** A "butchr user" is one
   butchr daemon identity (its own settings/rules and credentials). seer's
   own config file lists users, each with a display name and a list of
   `{ provider, query }` entries mirroring a butchr rule's own
   `resourceProvider` + `query` fields. seer executes those queries itself,
   with its own credentials — it does not depend on butchr's guarded,
   rate-limited `/api/rules` HTTP surface at runtime (though bootstrapping a
   seer config from a butchr rules file is fine).
3. **Refresh model: snapshot + poll.** A `seer snapshot` run executes every
   user's queries, expands links, and writes one schema-conformant
   `graph.json`. The viewer re-fetches that file on an interval (default 60s,
   configurable) and re-renders. No websockets, no push, no per-node live
   subscription.
4. **Hosting: loopback only.** seer serves its own static viewer and
   `graph.json` from a small HTTP server bound to localhost on a configurable
   port — never a public or cross-origin bind. The graph reveals rule shapes
   and queries, so it gets the same fail-closed posture butchr applies to
   itself.

The planned node-colour table (herdr's status→hex mapping) is recorded in
FACTORY-841's DECISIONS comment; this repo does not implement it (Story 3
owns that).

## The schemas

Both are exported from a single public entry point, `src/index.ts`, so later
stories import types rather than redeclaring them.

- **Config schema** (`src/config/schema.ts`, loader in `src/config/loader.ts`):
  parses and validates seer's own config file — a list of butchr users (each
  with a stable id, display name, and queries), a link-expansion depth
  (default 1), a viewer refresh interval (default 60s), and an HTTP port.
  There is deliberately no `host` field: seer's viewer always binds to
  loopback, so the schema has no way to express a non-loopback bind. Invalid
  config throws a `ConfigError` naming the offending field path — never a
  silent default, never a raw stack trace.

- **Graph JSON schema** (`src/graph/schema.ts`, validator in
  `src/graph/validate.ts`): the artifact the (future) collector writes and
  the (future) viewer reads. Per node: a canonical provider-qualified id,
  provider, label, URL, owning butchr user id, one of butchr's five
  `agent:*` statuses (`working | idle | blocked | stalled | none`), whether
  the provider is even capable of reporting status (`providerCanReportStatus`
  — distinguishes "cannot report" from "reports none"), and whether an
  admission-withheld marker is present. Per edge: source id, target id, and a
  small closed `kind` enum (`implements | blocks | relates | parent | link`).
  Top-level: a schema version, an ISO-8601 snapshot timestamp, the nodes and
  edges, and a per-query record (`userId`, `provider`, `query`, `matched`
  count, `error`) so a failed query is distinguishable from a zero-match one.
  `validateGraph` also checks that every edge references an existing node id.

## Fixture

`fixtures/graph.example.json` is a committed, schema-valid example graph: two
users, three providers (one of which, `confluence`, cannot report agent
status), all five agent-status values, an admission-withheld node, a failed
query record, a zero-match query record, and nodes reachable from both
users' root sets. `fixtures/seer.config.example.json` is a matching example
config. Story 4 (the D3 viewer) builds entirely against this fixture before
the real collector exists.

## Stack

TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
ESM, `moduleResolution: bundler`) on Bun, matching butchr's own tooling.
`bun install`, `bun run typecheck`, `bun run lint` (Biome), `bun test`.
