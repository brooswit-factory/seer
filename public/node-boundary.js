// FACTORY-882 review (PR #42, brooswit): `approxRadiusForNode`'s equal-area-circle radius
// underestimates the true boundary of every non-circular shape (Bug/triangle, Story/square,
// Epic/hexagon, Sub-task/diamond, the star every non-Jira node uses) — an edge arriving at a
// Bug's APEX, for instance, still buries the arrowhead tip in the triangle's fill even after
// shortening the line by the equal-area radius, because the apex sits well outside that circle.
//
// `farthestPointRadius` fixes this with a conservative enclosing radius (the reviewer's own
// suggested alternative to a full direction-aware boundary): it runs a D3-symbol-shaped `{
// draw(context, size) }` against a recording context and returns the farthest distance from the
// origin any point the path actually visits sits at. Since every `d3.symbolXxx` draws its shape
// centred on the origin, that farthest point IS the shape's own circumradius — never less than
// the true boundary in ANY direction, so an edge clipped to it clears the shape from every
// approach angle, not just the ones a hand-derived per-shape formula happens to cover. Pure/no
// DOM (the recording context below is a plain object, not a real CanvasRenderingContext2D), same
// "testable without a browser" contract shapes.js/node-scale.js already use — app.js supplies the
// real d3 symbol types (global `d3`, loaded via script tag, not an npm import) when it calls
// this for real rendering; this module never touches d3 itself; the draw implementation is
// whatever gets passed in.
export function farthestPointRadius(symbolType, size) {
  let maxR = 0;
  function visit(x, y) {
    const r = Math.hypot(x, y);
    if (r > maxR) maxR = r;
  }
  const context = {
    moveTo: visit,
    lineTo: visit,
    quadraticCurveTo(cx, cy, x, y) {
      visit(cx, cy);
      visit(x, y);
    },
    bezierCurveTo(x1, y1, x2, y2, x, y) {
      visit(x1, y1);
      visit(x2, y2);
      visit(x, y);
    },
    arc(x, y, r) {
      visit(x + r, y);
      visit(x - r, y);
      visit(x, y + r);
      visit(x, y - r);
    },
    rect(x, y, w, h) {
      visit(x, y);
      visit(x + w, y);
      visit(x, y + h);
      visit(x + w, y + h);
    },
    closePath() {},
  };
  symbolType.draw(context, size);
  return maxR;
}
