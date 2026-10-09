bump: patch

### Changed
- `SEER_SIZE_EPIC`/`SEER_SIZE_BUG`/`SEER_SIZE_STORY`/`SEER_SIZE_BASE` (`src/config/env.ts`) default to `2`/`2`/`1.5`/`1` (was `3`/`3`/`2`/`1.5`) — the fleet-scale graph read too large at the old tiers. Validation/settings surface unchanged.
- Node fill is agent status again (`public/colors.js`, unchanged herdr colours) — reverts FACTORY-900's inversion. The "cannot report status" dashed-outline treatment is back, now drawn on the border (see below) rather than the shape's own plain stroke.
- Node border is Jira workflow status (`public/jira-status.js`'s colour table, `public/shapes.js`'s new `borderForNode`): drawn as the shape's own 3-4px outline stroke, not a separate ring/circle, so it composes with every shape. Dashed exactly when the provider cannot report agent status.
- The Jira-status colour table (`public/jira-status.js`) is now held to the same >= 4.5:1 stroke-contrast floor `--node-stroke`/`--edge`/`--arrowhead` already use (was >= 3:1 as a fill); a handful of hexes were nudged within their hue family to clear that floor and to stay colour-blind-distinguishable from every agent-fill colour a border can now sit directly against (border-vs-fill adjacency).
- Legend: fill → agent status, border → Jira status, type → shape + size multipliers.

### Removed
- `public/agent-ring.js` (and its ring-drawing `circle.agent-ring` element): its colour decision is retired; its visibility/dash mechanics are repurposed into `shapes.js`'s `borderForNode`, which the shape's own stroke now expresses directly.
