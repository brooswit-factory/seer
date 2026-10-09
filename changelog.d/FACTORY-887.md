bump: minor

### Added
- New config field `collectTimeoutSeconds` (default 60): the worst-case seconds a real `collect()` run is expected to take.
- `bun run seer` now kicks off the first collect at startup, before the server starts accepting requests, instead of waiting for the first `/graph.json` request — `GraphCache`'s existing single-flight means any request arriving during that warm-up shares this same run rather than starting a second one.

### Fixed
- The viewer server's `Bun.serve` `idleTimeout` is now set to `collectTimeoutSeconds + 5` (65s by default) instead of Bun's 10s default, so a cold `/graph.json` whose inline collect takes longer than 10s no longer times out the browser's first load.
