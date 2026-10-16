bump: patch

### Fixed
- Edge arrowheads (`marker-end`) were drawn at the target node's own centre — the simulation's raw x/y — so most or all of the arrowhead sat underneath the node shape, which paints on top (`nodeLayer` is appended after `edgeLayer`). `public/app.js`'s `renderPositions` now pulls the edge's end point back to the target node's boundary (new pure helper `public/edge-geometry.js`'s `edgeEndPoint`, using the same `approxRadiusForNode` radius the collide force and fit-view already use), recomputed every tick and per-edge since node radius varies by type and size tier. Confirmed by serving the viewer locally against the committed fixture graph and comparing a cropped screenshot before/after — not inferred from the geometry alone.

### Notes
- Policy: this repo's CI has no GUI, so the visible symptom (and the fix) could not be asserted by a test; `edgeEndPoint`'s own geometry (stop short by exactly the radius, diagonal case, degenerate/coincident-points fallback) is covered by `test/edge-geometry.test.ts`, plus a source-level check that `renderPositions` actually calls it. Pushed for CI per ticket instructions; local `bun test`/typecheck not run, except running the dev server itself (`bun run seer`) to view the rendered page — the ticket's own named GUI exception, since seer's CI cannot show a rendered page.
