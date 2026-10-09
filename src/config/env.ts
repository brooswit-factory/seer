import { ConfigError } from "./loader.ts";

/**
 * Node-size multipliers (FACTORY-890): `base` applies to every node, `active` REPLACES it
 * (never stacks) for a node with a live agent — see `public/node-scale.js`'s `isLiveAgentNode`
 * for the exact definition of "live agent" these multipliers key off of.
 */
export interface SizeConfig {
  base: number;
  active: number;
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
 * SEER_SIZE_BASE / SEER_SIZE_ACTIVE, defaulting to 1.5 / 2 (FACTORY-900 item 6, latest revision —
 * supersedes FACTORY-890's original 2 / 8, and this ticket's own earlier 2/4 and 1.5/3 notes).
 * Decimal values > 0 are valid (`readPositiveEnvNumber` only rejects non-numeric, NaN, zero, and
 * negative); these are settings, not constants — the director has tweaked them repeatedly. With
 * active only ~1.33x base, the shape size barely signals "live agent" any more — the
 * agent-status ring (public/agent-ring.js) is now what carries that, per the director's own note.
 */
export function loadSizeConfig(): SizeConfig {
  return {
    base: readPositiveEnvNumber("SEER_SIZE_BASE", 1.5),
    active: readPositiveEnvNumber("SEER_SIZE_ACTIVE", 2),
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
