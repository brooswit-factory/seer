bump: patch

### Changed
- Agent-status fill (`public/colors.js`) recoloured to Brooswit's requested palette (FACTORY-944/FACTORY-943): Working = green, Blocked = red (unchanged), Idle = yellow, Stalled = orange (unchanged) — effectively swaps Working/Idle's old herdr-verified hexes. Now split into light/dark theme tokens (was a single table).
- Jira-status border (`public/jira-status.js`) recoloured: To Do = black, Backlog = grey, In Progress = green, In Review = yellow, Done = blue — replacing FACTORY-939's Okabe-Ito-derived set. Dark-theme "To Do" pairs a near-black token with a new thin light hairline (`jiraBorderHairlineForNode`, drawn as a second stroke by `public/shapes.js`/`app.js`) so it stays visible against the dark canvas without needing to clear the usual contrast floor there.
- Border-vs-fill adjacency (`public/shapes.js`'s `borderForNode`, `app.js`): the new In Progress-on-Working and In Review-on-Idle pairs are the same hue by design; each pair uses a visibly different shade so it stays colour-blind-distinguishable, pinned by new `test/jira-status.test.ts` adjacency tests.
- Legend (`app.js`'s fill/border legends) updated to the new per-theme hexes.

### Fixed
- `test/colors.test.ts`/`test/jira-status.test.ts` updated to the new palette; no leftover references to the old Working=yellow/Idle=green assignment or the old border hexes.
