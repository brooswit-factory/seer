import { ConfigError } from "./loader.ts";

/**
 * Node-size multipliers (FACTORY-913): one linear multiplier per Jira resource type that gets its
 * own setting (Epic, Bug, Story), plus `base` for everything else — Task, Sub-task, any other/
 * unknown Jira issue type, and every non-Jira provider node. REPLACES the earlier live-agent size
 * bump (`SEER_SIZE_ACTIVE`) and the single flat `base` tier from FACTORY-890/900: a live agent is
 * now signalled ONLY by the agent-status ring (`public/agent-ring.js`), never by node size.
 */
export interface SizeConfig {
  epic: number;
  bug: number;
  story: number;
  base: number;
}

/**
 * Compact-layout force-simulation constants (FACTORY-890/FACTORY-889 COMPACT LAYOUT item).
 * `charge` is stored as a positive magnitude; the viewer negates it for
 * `d3.forceManyBody().strength(-charge)` (repulsion).
 */
export interface LayoutConfig {
  linkDistance: number;
  charge: number;
  gravity: number;
}

/** Reads a positive-number env var, falling back to `defaultValue` when unset/empty. Never silently accepts a present-but-invalid value. */
function readPositiveEnvNumber(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new ConfigError(`Invalid seer config:\n  - ${name}: must be a positive number (got ${JSON.stringify(raw)})`);
  }
  return value;
}

/**
 * SEER_SIZE_EPIC / SEER_SIZE_BUG / SEER_SIZE_STORY / SEER_SIZE_BASE, defaulting to 3 / 3 / 2 / 1.5
 * (FACTORY-913, Brooswit HIGHEST): REPLACES FACTORY-890/900's single `SEER_SIZE_BASE`/
 * `SEER_SIZE_ACTIVE` pair — live agents are shown by the agent-status ring
 * (`public/agent-ring.js`) alone now, never by a node-size bump. Decimal values > 0 are valid
 * (`readPositiveEnvNumber` only rejects non-numeric, NaN, zero, and negative); these are
 * settings, not constants — the director has tweaked the size scheme repeatedly.
 *
 * `SEER_SIZE_ACTIVE` is no longer read. If it is still set in the environment (e.g. a deploy that
 * has not dropped it yet), log one startup warning instead of failing — the env var is simply
 * ignored. `loadSizeConfig()` itself runs once at server startup (`src/cli.ts`), so one warning
 * per call is already "one startup warning"; no extra latch needed to de-dupe within a process.
 */
export function loadSizeConfig(): SizeConfig {
  if (process.env.SEER_SIZE_ACTIVE !== undefined && process.env.SEER_SIZE_ACTIVE !== "") {
    console.warn("SEER_SIZE_ACTIVE is no longer used");
  }
  return {
    epic: readPositiveEnvNumber("SEER_SIZE_EPIC", 3),
    bug: readPositiveEnvNumber("SEER_SIZE_BUG", 3),
    story: readPositiveEnvNumber("SEER_SIZE_STORY", 2),
    base: readPositiveEnvNumber("SEER_SIZE_BASE", 1.5),
  };
}

/**
 * SEER_LINK_DISTANCE / SEER_CHARGE / SEER_GRAVITY. Defaults are deliberately tighter than the
 * pre-FACTORY-890 hardcoded values (link distance 60, charge magnitude 180, no gravity) per the
 * COMPACT LAYOUT requirement — "tighter link distance and weaker repulsion".
 */
export function loadLayoutConfig(): LayoutConfig {
  return {
    linkDistance: readPositiveEnvNumber("SEER_LINK_DISTANCE", 40),
    charge: readPositiveEnvNumber("SEER_CHARGE", 120),
    gravity: readPositiveEnvNumber("SEER_GRAVITY", 0.08),
  };
}
