bump: minor

### Added
- `SEER_SIZE_EPIC`/`SEER_SIZE_BUG`/`SEER_SIZE_STORY` (`src/config/env.ts`), defaulting to `3`/`3`/`2`: per-Jira-resource-type linear node-size multipliers, validated the same way as `SEER_SIZE_BASE` (positive decimals only). The viewer's size legend reads all four values from `/graph.json` (`sizeEpic`/`sizeBug`/`sizeStory`/`sizeBase`), never hardcoded.

### Changed
- Node size is now per-type: Epic and Bug nodes scale by `SEER_SIZE_EPIC`/`SEER_SIZE_BUG`, Story nodes by `SEER_SIZE_STORY`, and everything else (Task, Sub-task, any other/unknown Jira issue type, every non-Jira provider node) by `SEER_SIZE_BASE` (default `1.5`, unchanged).

### Removed
- `SEER_SIZE_ACTIVE` and the live-agent size bump it drove (`public/node-scale.js`'s `isLiveAgentNode`/`LIVE_AGENT_STATUSES`): a live agent is now signalled ONLY by the agent-status ring, never by a larger node. If `SEER_SIZE_ACTIVE` is still set in the environment, the server logs one startup warning ("SEER_SIZE_ACTIVE is no longer used") and otherwise ignores it — it never fails startup.
