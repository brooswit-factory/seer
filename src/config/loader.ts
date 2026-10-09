import { readFileSync } from "node:fs";
import { SeerConfigSchema, type SeerConfig } from "./schema.ts";

/** Thrown by {@link loadConfig}/{@link parseConfig} on an invalid config — never a raw stack trace. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function formatZodError(error: { issues: Array<{ path: Array<string | number>; message: string }> }): string {
  const lines = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `  - ${path}: ${issue.message}`;
  });
  return `Invalid seer config:\n${lines.join("\n")}`;
}

/** Matches `currentUser()`, case-insensitive, tolerating whitespace before the parens. */
const CURRENT_USER_PATTERN = /currentuser\s*\(\s*\)/i;

/**
 * seer runs every source's queries under its OWN single credential — there
 * is no per-source butchr session. `currentUser()` would therefore resolve
 * to seer's own account for every (machine, user) source, silently
 * collapsing all bubbles onto one identity instead of failing loudly. A
 * query must name its user explicitly (e.g. an accountId or username).
 */
function checkNoCurrentUser(config: SeerConfig): void {
  for (const [sourceIndex, source] of config.sources.entries()) {
    for (const [queryIndex, query] of source.queries.entries()) {
      if (CURRENT_USER_PATTERN.test(query.query)) {
        throw new ConfigError(
          `Invalid seer config:\n` +
            `  - sources.${sourceIndex}.queries.${queryIndex}.query: must not contain currentUser() — ` +
            `seer runs all queries under ONE credential, so currentUser() would resolve to seer's own ` +
            `account for every source and silently collapse all bubbles. Name this source's user explicitly ` +
            `(e.g. an accountId or username) instead.`,
        );
      }
    }
  }
}

/** Parse and validate an already-loaded JSON value as a {@link SeerConfig}. Never defaults a malformed value silently. */
export function parseConfig(data: unknown): SeerConfig {
  const result = SeerConfigSchema.safeParse(data);
  if (!result.success) {
    throw new ConfigError(formatZodError(result.error));
  }
  checkNoCurrentUser(result.data);
  return result.data;
}

/** Read, parse and validate a seer config file from disk. */
export function loadConfig(path: string): SeerConfig {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (cause) {
    throw new ConfigError(`Could not read config file at ${path}: ${(cause as Error).message}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (cause) {
    throw new ConfigError(`Config file at ${path} is not valid JSON: ${(cause as Error).message}`);
  }

  return parseConfig(data);
}
