import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

/**
 * Source-level check (FACTORY-975/FACTORY-974's TESTS item 5): asserts no
 * requestAnimationFrame/setInterval render loop was added to drive the agent-status pulse — the
 * ticket requires the pulsing to be pure CSS `@keyframes`, never a JS loop re-rendering the
 * graph. `public/app.js` already has exactly ONE pre-existing `setInterval` (the ~30s live-data
 * poll, unrelated to this feature, predating it) and zero `requestAnimationFrame` calls — this
 * test pins both counts so a future change that adds either for the pulse (or anything else)
 * fails loudly, same "read the real source" convention the other source-level checks in this
 * repo use (e.g. FACTORY-968's tspan-structure tests, this repo having no DOM harness).
 */
const PUBLIC_DIR_PATH = new URL("../public/", import.meta.url).pathname;

function readPublicJs(filename: string): string {
  return readFileSync(`${PUBLIC_DIR_PATH}${filename}`, "utf-8");
}

describe("no requestAnimationFrame/setInterval render loop added for the pulse feature", () => {
  test("public/agent-animation.js (the pure pulse-decision module) uses neither", () => {
    const src = readPublicJs("agent-animation.js");
    expect(src).not.toMatch(/requestAnimationFrame\s*\(/);
    expect(src).not.toMatch(/setInterval\s*\(/);
  });

  test("public/animation-prefs.js (the toggle-persistence module) uses neither", () => {
    const src = readPublicJs("animation-prefs.js");
    expect(src).not.toMatch(/requestAnimationFrame\s*\(/);
    expect(src).not.toMatch(/setInterval\s*\(/);
  });

  test("public/app.js has zero requestAnimationFrame calls", () => {
    const src = readPublicJs("app.js");
    expect(src.match(/requestAnimationFrame\s*\(/g) ?? []).toHaveLength(0);
  });

  test("public/app.js still has exactly the one pre-existing setInterval (the live-data poll), not a second one added for the pulse", () => {
    const src = readPublicJs("app.js");
    expect(src.match(/setInterval\s*\(/g) ?? []).toHaveLength(1);
  });

  test("no file under public/ uses requestAnimationFrame at all", () => {
    const files = readdirSync(PUBLIC_DIR_PATH).filter((f) => f.endsWith(".js"));
    for (const file of files) {
      expect(readPublicJs(file)).not.toMatch(/requestAnimationFrame\s*\(/);
    }
  });
});

describe("the pulse classes are applied on every render pass, not just once on enter", () => {
  const appJs = readPublicJs("app.js");

  test("applyPulseClasses runs on the merged (entered + pre-existing) selection inside renderNodeSelection, so a status change on refresh swaps the class in place", () => {
    expect(appJs).toMatch(/applyPulseClasses\(merged\)/);
  });

  test("the pause toggle restyles existing nodes immediately via the same function, without waiting for the next apply()", () => {
    expect(appJs).toMatch(/function setAnimationsEnabled\([^)]*\)\s*\{[^}]*applyPulseClasses\(nodeSel\)/);
  });

  test("the active pulse class is forced to null when the toggle is off — toggle off removes the animation classes", () => {
    expect(appJs).toMatch(/animationsEnabled\s*\?\s*animationClassFor\(d\)\s*:\s*null/);
  });

  test("the toggle's preference is persisted via animation-prefs.js, not a one-off inline localStorage call", () => {
    expect(appJs).toMatch(/import\s*\{[^}]*loadAnimationsEnabled[^}]*\}\s*from\s*"\.\/animation-prefs\.js"/);
    expect(appJs).toMatch(/saveAnimationsEnabled\(animationsEnabled\)/);
  });
});
