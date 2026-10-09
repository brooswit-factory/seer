bump: patch

### Changed
- Agent-status fill (`public/colors.js`) recoloured again (FACTORY-963/FACTORY-965 via FACTORY-966): Idle moves from FACTORY-944's yellow to cyan (light `#04a5e5`, Catppuccin Latte "Sky"; dark `#acf0f6`, a custom pale cyan — Catppuccin Mocha's own cyan accents (Sky `#89dceb`, Sapphire `#74c7ec`) fail the >=30 colour-blind-distance floor against In Review's bright cyan border `#67e8f9`). Stalled moves from orange/peach to yellow (light `#df8e1d`, Catppuccin Latte "Yellow"; dark `#f9e2af`, Catppuccin Mocha "Yellow" — reusing Idle's old dark hex now that Idle has moved on). Working/Blocked/`none` are unchanged. Both new tokens verified >=30 colour-blind distance against every other agent fill and every `public/jira-status.js` border in that theme, not picked by eye; see `public/colors.js`'s header comment and `test/colors.test.ts`/`test/jira-status.test.ts` for the exact numbers.
- `test/jira-status.test.ts` gets a new named test ("Idle fill (cyan) vs In Review border (cyan)") for the cyan-on-cyan pair this change re-creates, mirroring the existing green-on-green (In Progress border vs Working fill) named test; the general border-vs-fill adjacency loop already covered it structurally.
- Legend (`app.js`'s fill legend) picks up the new hexes automatically — it reads `STATUS_COLORS` at render time, no code change needed.
- README updated: both prose mentions of the Idle/Stalled palette now say cyan/yellow instead of yellow/orange.

### Fixed
- Stale header comments in `public/colors.js` and `public/jira-status.js` describing the old yellow Idle / orange Stalled assignment, and the claim that the In-Review-vs-Idle same-hue pairing "no longer applies" (it does again, just with cyan instead of yellow).
