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

  test("the status legend (agent status colours) is still rendered", () => {
    const appJs = readViewerFile("app.js");
    expect(appJs).toMatch(/renderLegend/);
    expect(appJs).toMatch(/STATUS_COLORS/);
  });

  test("the tooltip is unchanged: still shows label, provider, id, status, discovery, link", () => {
    const appJs = readViewerFile("app.js");
    expect(appJs).toMatch(/showTooltip/);
    for (const field of ["label", "provider", "id", "status", "discovery", "link"]) {
      expect(appJs).toContain(`<dt>${field}</dt>`);
    }
  });

  test("nodes are still coloured via colors.js, untouched", () => {
    const appJs = readViewerFile("app.js");
    expect(appJs).toMatch(/colorForNode/);
  });
});
