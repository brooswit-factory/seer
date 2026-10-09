/**
 * Resolves which config file `seer`/`seer collect` should load, in precedence order:
 * `--config <path>` flag > `SEER_CONFIG` env var > a subcommand's own positional arg
 * (collect's pre-existing `seer collect [config]` form) > the committed fixture default.
 * `explicit` distinguishes "a path was named" from "we fell back to the default" — the
 * caller uses it to decide whether an unreadable path should fail loudly or fall back.
 */
export interface ResolvedConfigPath {
  path: string;
  explicit: boolean;
  source: "flag" | "env" | "positional" | "default";
}

/** Strips a recognized `--config <path>` / `--config=<path>` pair out of argv, leaving the rest. */
export function stripConfigFlag(args: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--config") {
      i++; // also skip its value
      continue;
    }
    if (arg?.startsWith("--config=")) {
      continue;
    }
    if (arg !== undefined) {
      result.push(arg);
    }
  }
  return result;
}

function parseConfigFlag(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--config") {
      return args[i + 1];
    }
    if (arg?.startsWith("--config=")) {
      return arg.slice("--config=".length);
    }
  }
  return undefined;
}

export function resolveConfigPath(options: {
  args: string[];
  env: Record<string, string | undefined>;
  positional?: string;
  defaultPath: string;
}): ResolvedConfigPath {
  const flag = parseConfigFlag(options.args);
  if (flag !== undefined) {
    return { path: flag, explicit: true, source: "flag" };
  }
  const env = options.env.SEER_CONFIG;
  if (env) {
    return { path: env, explicit: true, source: "env" };
  }
  if (options.positional !== undefined) {
    return { path: options.positional, explicit: true, source: "positional" };
  }
  return { path: options.defaultPath, explicit: false, source: "default" };
}
