import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function readViewerFile(name: string): string {
  const path = new URL(`../public/${name}`, import.meta.url).pathname;
  return readFileSync(path, "utf-8");
}

describe("viewer: no per-user grouping", () => {
  test("app.js draws no hulls, hull labels, or hull colours", () => {
    const appJs = readViewerFile("app.js");
    expect(appJs).not.toMatch(/hull/i);
  });

  test("app.js has no grouping legend keyed off ownerSourceId", () => {
    const appJs = readViewerFile("app.js");
    expect(appJs).not.toMatch(/ownerSourceId/);
  });

  test("style.css has no hull-related rules", () => {
    const css = readViewerFile("style.css");
    expect(css).not.toMatch(/hull/i);
  });

  test("the agent-status fill legend (agent status colours) is still rendered", () => {
    const appJs = readViewerFile("app.js");
    expect(appJs).toMatch(/renderFillLegend/);
    expect(appJs).toMatch(/STATUS_COLORS/);
  });

  // FACTORY-957 split `showTooltip`'s content-building out into `public/node-info.js`'s
  // `nodeInfoHtml` (see test/node-info.test.ts for full field/ordering coverage) so the hover
  // tooltip and the new right-panel node-info view share ONE builder — `showTooltip` itself now
  // only positions the cursor, so the literal `<dt>...</dt>` fields live in node-info.js, not
  // here. This test's shape changes accordingly: app.js must still call `showTooltip` (and now
  // `nodeInfoHtml`, never a second inline HTML builder), while node-info.js is what's checked for
  // the actual tooltip content/fields.
  test("the tooltip is unchanged: still shows label, provider, id, status, discovery, link — via the shared nodeInfoHtml builder, not inlined in app.js", () => {
    const appJs = readViewerFile("app.js");
    const nodeInfoJs = readViewerFile("node-info.js");
    expect(appJs).toMatch(/showTooltip/);
    expect(appJs).toMatch(/nodeInfoHtml/);
    for (const field of ["label", "provider", "id", "status", "discovery", "link"]) {
      expect(appJs).not.toContain(`<dt>${field}</dt>`);
      expect(nodeInfoJs).toContain(`<dt>${field}</dt>`);
    }
  });

  test("agent status is back on the fill, drawn directly via colors.js's colorForNode (FACTORY-939, reverting FACTORY-900's inversion)", () => {
    const appJs = readViewerFile("app.js");
    expect(appJs).toMatch(/colorForNode/);
    // agent-ring.js was retired — the Jira border now lives on the shape's own stroke (shapes.js).
    expect(appJs).not.toMatch(/agentRingForNode/);
    expect(appJs).not.toMatch(/agent-ring\.js/);
  });

  test("node border is the Jira-status palette via shapes.js's borderForNode, not the old fill-based jiraFillForNode (FACTORY-939)", () => {
    const appJs = readViewerFile("app.js");
    expect(appJs).toMatch(/borderForNode/);
    expect(appJs).not.toMatch(/jiraFillForNode/);
  });

  test("the discovery dot is a fixed-radius constant, never scaled by node size (FACTORY-900 item 7)", () => {
    const appJs = readViewerFile("app.js");
    expect(appJs).toMatch(/DISCOVERY_DOT_RADIUS\s*=\s*2\.5/);
    expect(appJs).toMatch(/discovery-dot["'][\s\S]{0,40}DISCOVERY_DOT_RADIUS/);
    // The dot must never be multiplied by scaledSizeForNode/sizeConfig — only the constant itself.
    expect(appJs).not.toMatch(/discovery-dot[\s\S]{0,120}scaledSizeForNode/);
  });
});

describe("viewer: per-type node size (FACTORY-913)", () => {
  test("no live-agent size branch is left in app.js or node-scale.js", () => {
    const appJs = readViewerFile("app.js");
    const nodeScaleJs = readViewerFile("node-scale.js");
    expect(appJs).not.toMatch(/SEER_SIZE_ACTIVE/);
    expect(appJs).not.toMatch(/isLiveAgentNode/);
    expect(nodeScaleJs).not.toMatch(/isLiveAgentNode/);
    expect(nodeScaleJs).not.toMatch(/LIVE_AGENT_STATUSES/);
    expect(nodeScaleJs).not.toMatch(/\bactive\b/);
  });

  test("the size legend reads sizeEpic/sizeBug/sizeStory/sizeBase from the graph meta, never a hardcoded multiplier", () => {
    const appJs = readViewerFile("app.js");
    expect(appJs).toMatch(/renderSizeLegend/);
    expect(appJs).toMatch(/graph\.sizeEpic/);
    expect(appJs).toMatch(/graph\.sizeBug/);
    expect(appJs).toMatch(/graph\.sizeStory/);
    expect(appJs).toMatch(/graph\.sizeBase/);
  });
});
