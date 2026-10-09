import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * Reads the ACTUAL stylesheet (not a hand-copied snippet) and asserts the pulse keyframes and
 * the `prefers-reduced-motion` override both exist — same "read the real file" convention
 * test/contrast.test.ts/test/node-label.test.ts already use for style.css.
 */
const css = readFileSync(new URL("../public/style.css", import.meta.url).pathname, "utf-8");

describe("agent-status pulse stylesheet (FACTORY-975/FACTORY-974)", () => {
  test("defines a keyframe + class for each of the three animated states", () => {
    expect(css).toMatch(/@keyframes\s+seer-pulse-body-working\s*\{/);
    expect(css).toMatch(/@keyframes\s+seer-pulse-border-stalled\s*\{/);
    expect(css).toMatch(/@keyframes\s+seer-pulse-border-blocked\s*\{/);
    expect(css).toMatch(/\.pulse-body-working\s*\{[^}]*animation:\s*seer-pulse-body-working/);
    expect(css).toMatch(/\.pulse-border-stalled\s*\{[^}]*animation:\s*seer-pulse-border-stalled/);
    expect(css).toMatch(/\.pulse-border-blocked\s*\{[^}]*animation:\s*seer-pulse-border-blocked/);
  });

  test("blocked pulses faster (shorter period) than stalled, which pulses faster than working", () => {
    const period = (selector: string) => {
      // Anchored on "animation:" immediately inside the rule (not just any `{...}` with that
      // selector) — `.pulse-border-blocked` is the LAST name in the shared `transform-box`/
      // `transform-origin` selector list above the per-class rules, so it's the one selector
      // here with no preceding comma before its own standalone rule's `{`; matching on the
      // declaration itself, not just the selector+brace, avoids capturing that shared rule
      // instead of the real per-class one.
      const duration = css.match(new RegExp(`\\.${selector}\\s*\\{\\s*animation:\\s*\\S+\\s+([\\d.]+)s`));
      if (!duration) throw new Error(`style.css: no animation duration found for .${selector}`);
      return Number(duration[1]);
    };
    const working = period("pulse-body-working");
    const stalled = period("pulse-border-stalled");
    const blocked = period("pulse-border-blocked");
    expect(blocked).toBeLessThan(stalled);
    expect(stalled).toBeLessThan(working);
  });

  test("each pulse class scales about its own path centre, not the translated node group", () => {
    const sharedRule = css.match(
      /\.pulse-body-working,\s*\n?\s*\.pulse-border-stalled,\s*\n?\s*\.pulse-border-blocked\s*\{([^}]*)\}/,
    );
    expect(sharedRule, "style.css: expected a shared rule for the three pulse classes").not.toBeNull();
    expect(sharedRule![1]).toMatch(/transform-box:\s*fill-box/);
    expect(sharedRule![1]).toMatch(/transform-origin:\s*center/);
  });

  test("the border pulse (blocked) scales outward and goes slightly thicker at its peak", () => {
    const block = css.match(/@keyframes\s+seer-pulse-border-blocked\s*\{([^]*?)\n\}/);
    expect(block, "style.css: could not find the blocked keyframe body").not.toBeNull();
    const body = block![1]!;
    expect(body).toMatch(/scale\(1\.2\)/);
    const widths = [...body.matchAll(/stroke-width:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
    expect(widths.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths));
  });

  test("honours prefers-reduced-motion: reduce by disabling all three pulse animations", () => {
    const media = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([^]*?)\n\}\n/);
    expect(media, "style.css: no prefers-reduced-motion override found").not.toBeNull();
    const body = media![1]!;
    expect(body).toMatch(/\.pulse-body-working/);
    expect(body).toMatch(/\.pulse-border-stalled/);
    expect(body).toMatch(/\.pulse-border-blocked/);
    expect(body).toMatch(/animation:\s*none/);
  });

  test("the sidebar's pulse toggle button exists in the markup", () => {
    const html = readFileSync(new URL("../public/index.html", import.meta.url).pathname, "utf-8");
    expect(html).toMatch(/id="animation-toggle"/);
  });
});
