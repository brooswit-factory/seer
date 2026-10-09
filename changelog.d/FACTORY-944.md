bump: patch

### Changed
- Agent-status fill (`public/colors.js`) recoloured to Brooswit's requested palette (FACTORY-944/FACTORY-943): Working = green, Blocked = red (unchanged), Idle = yellow, Stalled = orange (unchanged) — effectively swaps Working/Idle's old herdr-verified hexes. Now split into light/dark theme tokens (was a single table).
- Jira-status border (`public/jira-status.js`) recoloured: To Do = black, Backlog = grey, In Progress = green, In Review = yellow, Done = blue — replacing FACTORY-939's Okabe-Ito-derived set. Dark-theme "To Do" pairs a near-black token with a new thin light hairline (`jiraBorderHairlineForNode`, drawn by `public/shapes.js`'s `borderForNode`/`app.js`) so it stays visible against the dark canvas without needing to clear the usual contrast floor there.
- Border-vs-fill adjacency (FACTORY-944 item 3, PR #29 review): a genuine canvas-coloured gap is now drawn between a node's fill and its Jira-status border (`public/shapes.js`'s `fillInsetForNode`/`BORDER_GAP_WIDTH`, `app.js`) — the fill shape is drawn smaller than the border's own path so the canvas shows through between them, rather than relying on shade difference alone for the same-hue In Progress-on-Working (green) and In Review-on-Idle (yellow) pairs.
- Legend (`app.js`'s fill/border legends) updated to the new per-theme hexes.
- Discovery dot (`circle.discovery-dot`, FACTORY-945 scope addendum from Brooswit via FACTORY-943): FLIPPED to mark a direct query hit (`discovery === "query"`) instead of a link-discovered node — "dots on those that the query hits, no dots on the others." Never shown on a project node either way. Legend row and README updated to match.

### Fixed
- `test/colors.test.ts`/`test/jira-status.test.ts`/`test/shapes.test.ts` updated to the new palette and gap mechanism; no leftover references to the old Working=yellow/Idle=green assignment, the old border hexes, or the old discovery-dot meaning.
- Light-theme In Review border (PR #29 review item 2) replaced a redder, brown-reading attempt with a true (R=G, B=0) dark yellow that still clears the 4.5:1 contrast floor; light-theme Idle fill replaced an amber "yellow" too close to Stalled's orange under simulated colour-blindness with a clearly-distinct bright yellow (fill has no contrast floor to honour, so nothing constrains the choice the way it does for the border).
