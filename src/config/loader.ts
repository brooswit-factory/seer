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

/** Parse and validate an already-loaded JSON value as a {@link SeerConfig}. Never defaults a malformed value silently. */
export function parseConfig(data: unknown): SeerConfig {
  const result = SeerConfigSchema.safeParse(data);
  if (!result.success) {
    throw new ConfigError(formatZodError(result.error));
  }
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
