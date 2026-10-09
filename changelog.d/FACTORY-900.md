bump: minor

### Added
- `GraphNodeSchema` gained an optional `jiraStatus: { name, category }` field (`category` one of `new | indeterminate | done`) — the Jira collector now requests the issue `status` field (both on search and single-issue fetch) and maps it onto every Jira node; absent on old data and non-Jira nodes, which still validate.
- `public/jira-status.js`: a colour-blind-safe (Okabe-Ito-derived), theme-tokened (light + dark) fill palette for five Jira statuses (To Do, Backlog, In Progress, In Review, Done), with a `statusCategory` fallback for custom statuses and a neutral grey for non-Jira/unknown nodes. Node FILL now encodes Jira status instead of agent status.
- `public/agent-ring.js`: agent status moved from the fill to a thick (3-4px) ring drawn outside it, using `colors.js`'s herdr colours completely unchanged — just painted somewhere else. `none` draws no ring; "cannot report status" draws a thin dashed neutral ring.
- `public/colorblind.js`: a protanopia/deuteranopia/tritanopia simulation, used by `test/jira-status.test.ts` to assert a minimum pairwise colour distance between the five status fills survives each type of colour blindness.
- The sidebar legend now shows three groups: type → shape, Jira status → fill, agent status → ring (plus the pre-existing admission-withheld and link-discovery-dot notes).

### Changed
- `SEER_SIZE_BASE`/`SEER_SIZE_ACTIVE` (`src/config/env.ts`) default to `1.5`/`2` (was `2`/`8`) — with active now only slightly larger than base, the new agent-status ring is what signals "has a live agent".
- The link-discovered hollow dot (`circle.discovery-dot`) now uses a named `DISCOVERY_DOT_RADIUS` constant and stays fixed regardless of `SEER_SIZE_BASE`/`SEER_SIZE_ACTIVE`.
- The admission-withheld ring moved further out (`approxRadiusForNode(d) + 9`, was `+ 4`) so it stays visually distinct from the new, closer-in agent-status ring.
