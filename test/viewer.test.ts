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

  test("the agent-status ring legend (agent status colours) is still rendered", () => {
    const appJs = readViewerFile("app.js");
    expect(appJs).toMatch(/renderRingLegend/);
    expect(appJs).toMatch(/STATUS_COLORS/);
  });

  test("the tooltip is unchanged: still shows label, provider, id, status, discovery, link", () => {
    const appJs = readViewerFile("app.js");
    expect(appJs).toMatch(/showTooltip/);
    for (const field of ["label", "provider", "id", "status", "discovery", "link"]) {
      expect(appJs).toContain(`<dt>${field}</dt>`);
    }
  });

  test("agent status moved to the ring, drawn via colors.js (unchanged) through agent-ring.js (FACTORY-900)", () => {
    const appJs = readViewerFile("app.js");
    const agentRingJs = readViewerFile("agent-ring.js");
    expect(appJs).toMatch(/agentRingForNode/);
    expect(agentRingJs).toMatch(/colorForNode/);
  });

  test("node fill is the Jira-status palette (public/jira-status.js), not colors.js (FACTORY-900)", () => {
    const appJs = readViewerFile("app.js");
    expect(appJs).toMatch(/jiraFillForNode/);
  });

  test("the discovery dot is a fixed-radius constant, never scaled by node size (FACTORY-900 item 7)", () => {
    const appJs = readViewerFile("app.js");
    expect(appJs).toMatch(/DISCOVERY_DOT_RADIUS\s*=\s*2\.5/);
    expect(appJs).toMatch(/discovery-dot["'][\s\S]{0,40}DISCOVERY_DOT_RADIUS/);
    // The dot must never be multiplied by scaledSizeForNode/sizeConfig — only the constant itself.
    expect(appJs).not.toMatch(/discovery-dot[\s\S]{0,120}scaledSizeForNode/);
  });
});
