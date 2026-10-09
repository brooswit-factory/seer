import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// app.js is plain <script type="module">, no bundler, no DOM test harness in this repo (see
// test/viewer.test.ts for the existing precedent) — these tests inspect the SOURCE for the wiring
// that can't be exercised as pure functions (DOM structure, event wiring), while
// test/selection.test.ts / test/node-info.test.ts / test/sidebar-list.test.ts cover the actual
// logic headlessly.

function readViewerFile(name: string): string {
  const path = new URL(`../public/${name}`, import.meta.url).pathname;
  return readFileSync(path, "utf-8");
}

describe("FACTORY-957: left node-list sidebar", () => {
  test("index.html has the left node-list sidebar with a filter box and a listbox", () => {
    const html = readViewerFile("index.html");
    expect(html).toMatch(/id="node-list-sidebar"/);
    expect(html).toMatch(/id="node-filter"/);
    expect(html).toMatch(/id="node-list"[^>]*role="listbox"/);
  });

  test("app.js sorts and filters the list via public/sidebar-list.js, not ad-hoc inline logic", () => {
    const appJs = readViewerFile("app.js");
    expect(appJs).toMatch(/from ["']\.\/sidebar-list\.js["']/);
    expect(appJs).toMatch(/sortNodesForSidebar/);
    expect(appJs).toMatch(/filterNodesForSidebar/);
  });

  test("app.js wires keyboard nav (arrows + Enter) on the node list", () => {
    const appJs = readViewerFile("app.js");
    const keydownBlock = appJs.slice(appJs.indexOf('getElementById("node-list").addEventListener("keydown"'));
    expect(keydownBlock).toMatch(/ArrowDown/);
    expect(keydownBlock).toMatch(/ArrowUp/);
    expect(keydownBlock).toMatch(/Enter/);
  });
});

describe("FACTORY-957: selection reducer wiring", () => {
  test("app.js uses the pure selection reducer (public/selection.js) for both graph-click and list-click selection — not two separate ad-hoc state machines", () => {
    const appJs = readViewerFile("app.js");
    expect(appJs).toMatch(/from ["']\.\/selection\.js["']/);
    expect(appJs).toMatch(/onNodeClick/);
    expect(appJs).toMatch(/selectFromList/);
    expect(appJs).toMatch(/reconcileSelection/);
  });

  test("empty-canvas click and the panel's close control both deselect", () => {
    const appJs = readViewerFile("app.js");
    expect(appJs).toMatch(/onBackgroundClick/);
    expect(appJs).toMatch(/node-info-close/);
  });
});

describe("FACTORY-957: right panel toggles between legend and node-info", () => {
  test("index.html has both a legend view and a node-info view inside #sidebar, node-info hidden by default", () => {
    const html = readViewerFile("index.html");
    expect(html).toMatch(/id="legend-view"/);
    expect(html).toMatch(/id="node-info-view"[^>]*hidden/);
  });

  test("app.js toggles `hidden` on legend-view/node-info-view based on selection, using the shared nodeInfoHtml builder", () => {
    const appJs = readViewerFile("app.js");
    expect(appJs).toMatch(/legendView\.hidden/);
    expect(appJs).toMatch(/infoView\.hidden/);
    expect(appJs).toMatch(/nodeInfoHtml/);
  });

  test("the hover tooltip path and the right-panel path both call nodeInfoHtml — exactly one call site is the showTooltip body, the other is the panel renderer, never a copy-pasted second builder", () => {
    const appJs = readViewerFile("app.js");
    const calls = appJs.match(/nodeInfoHtml\(/g) ?? [];
    // One call inside showTooltip, one inside the right-panel renderer — not zero, not one, not
    // a larger number from a copy-pasted third builder.
    expect(calls.length).toBe(2);
  });
});

describe("FACTORY-957 item 4: pan-to-selection must not override user pan/zoom like Fit does", () => {
  test("panToSelectedNode never touches userTransformed (unlike fit({force:true}))", () => {
    const appJs = readViewerFile("app.js");
    const start = appJs.indexOf("function panToSelectedNode");
    expect(start).toBeGreaterThan(-1);
    const end = appJs.indexOf("\n  }", start);
    const body = appJs.slice(start, end);
    expect(body).not.toMatch(/userTransformed/);
  });
});
