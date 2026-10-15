bump: minor

### Added
- On select (graph click, sidebar row click), seer now pins the selected node and its direct neighbours (`public/selection.js`'s `neighboursOf`) in place and pushes every other node radially away from that focus group's centroid via a new O(n) d3 force (`public/focus-force.js`), eased in via alpha and bounded to a configurable multiple of the focus group's own radius. The focus group stays at full opacity; every other node and edge dims via a new `.dimmed` CSS class (`public/focus-dim.js` picks who; `public/style.css`'s `--dim-opacity` token styles it), never touching node/edge labels so existing contrast guarantees hold.
- Deselecting releases only the pins the selection itself set (`public/focus-pins.js` tracks selection-pins separately from user drag-pins); dragging a selection-pinned node promotes it to a permanent user pin so a later deselect leaves it alone.
- Respects `prefers-reduced-motion: reduce`: the focus push/pin/dim change applies as an instant jump (simulation ticked synchronously to rest) instead of easing in via alpha.

### Notes
- Policy: pushed for CI per ticket instructions; local `bun test`/typecheck not run here, except a standalone perf measurement script (not committed) timing `createFocusForce` directly over synthetic node counts from 136 up to 2176 — per-tick cost scales linearly with node count (~0.56-1.3µs/node/tick, not growing with n), confirming the force is O(n) per tick with no all-pairs loop; see the PR description for the full numbers.
