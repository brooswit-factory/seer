bump: patch

### Added
- Node labels (`public/app.js`) now render as two lines: line 1 is the node's own key (derived from its id — `jira-work:FACTORY-946` -> `FACTORY-946`), line 2 is the label with that key prefix stripped, ~80% size and muted via a new `--node-label-muted` theme token (`public/style.css`, light `#5c5f77`/dark `#a6adc8`, both >=4.5:1 against `--bg`). New pure module `public/node-label.js` owns the key/name split and the per-line, per-node-radius character budget/truncation (`splitNodeLabel`, `maxCharsForRadius`, `truncateToChars`) and the two lines' vertical offsets (`line1Dy`, `labelBottomExtent`).
- `app.js`'s fit-to-view bbox now uses `labelBottomExtent` (the two-line label's own lowest pixel) instead of just the node's shape radius, so line 2 is never clipped out of the fitted view.

### Changed
- The old fixed 22-char single-line `truncateLabel`/`LABEL_MAX_CHARS` is retired in favour of per-line, per-node-size truncation in `public/node-label.js`.
