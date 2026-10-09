bump: patch

### Fixed
- `GraphCache` now treats a `collect()` that resolves with every query errored and nothing matched exactly like a thrown collect: it serves the last-good snapshot with `stale:true`/`staleSince` (or the fixture with `usingFixture:true` on a cold start) instead of promoting the empty result to `lastGood` and serving it as live. A partial failure (at least one query matched) still serves the fresh graph unchanged.
- `queries[].error` is now passed through the credential sanitiser on every path the cache serves (fresh, stale, fixture), not only the cache's top-level `error` field.
