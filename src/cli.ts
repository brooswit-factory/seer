#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { loadConfig } from "./config/loader.ts";
import { resolveConfigPath, stripConfigFlag, type ResolvedConfigPath } from "./config/resolve-path.ts";
import type { SeerConfig } from "./config/schema.ts";
import { parseGraph } from "./graph/validate.ts";
import { collect } from "./collector/collect.ts";
import { JiraProvider } from "./collector/jira.ts";
import { writeSnapshot } from "./collector/snapshot.ts";
import { startServer } from "./server/serve.ts";
import { GraphCache } from "./server/graph-cache.ts";
import { createSanitizeError } from "./server/sanitize-error.ts";
import type { Graph } from "./graph/schema.ts";

const DEFAULT_CONFIG_PATH = new URL("../fixtures/seer.config.example.json", import.meta.url).pathname;
const DEFAULT_GRAPH_PATH = new URL("../graph.json", import.meta.url).pathname;
const FIXTURE_GRAPH_PATH = new URL("../fixtures/graph.example.json", import.meta.url).pathname;

function usage(): never {
  console.error(
    [
      "Usage:",
      "  bun run seer [--config <path>]                 Serve the viewer on localhost and open the browser; /graph.json is collected live from Jira, cached, and falls back to the committed fixture if nothing has ever succeeded.",
      "  bun run seer collect [config] [--config <path>] Run every source's queries once and write graph.json — a one-off snapshot, independent of `seer serve`'s own live cache.",
      "",
      "Config path precedence: --config <path> > SEER_CONFIG env var > (collect's own positional [config] arg) > the committed fixtures/seer.config.example.json default.",
    ].join("\n"),
  );
  process.exit(1);
}

function readJiraEnv() {
  return {
    baseUrl: process.env.JIRA_BASE_URL,
    email: process.env.JIRA_EMAIL,
    apiToken: process.env.JIRA_API_TOKEN,
  };
}

async function runCollect(argv: string[], positional: string | undefined) {
  const resolved = resolveConfigPath({ args: argv, env: process.env, positional, defaultPath: DEFAULT_CONFIG_PATH });
  const config = loadConfig(resolved.path); // throws a clear ConfigError if unreadable — always, flag/env/positional alike
  const { baseUrl, email, apiToken } = readJiraEnv();
  if (!baseUrl || !email || !apiToken) {
    console.error("collect requires JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN in the environment.");
    process.exit(1);
  }

  const jira = new JiraProvider({ baseUrl, email, apiToken });
  const graph = await collect(config, { "jira-work": jira }, { resultCap: config.resultCap });
  parseGraph(graph); // throws loudly on a shape bug rather than writing a snapshot nothing can read
  writeSnapshot(DEFAULT_GRAPH_PATH, graph);

  const truncated = graph.queries.filter((q) => q.truncated).length;
  const failed = graph.queries.filter((q) => q.error != null).length;
  console.log(
    `seer: wrote ${DEFAULT_GRAPH_PATH} — ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.queries.length} queries (${failed} failed, ${truncated} truncated).`,
  );
}

function loadFixtureGraph(): Graph {
  return parseGraph(JSON.parse(readFileSync(FIXTURE_GRAPH_PATH, "utf-8")));
}

/** Builds the one real collection step `GraphCache` calls on a cache miss — never throws a raw, unsanitised error (the caller sanitises). */
function buildCollectFn(config: SeerConfig | null): () => Promise<Graph> {
  return async () => {
    if (!config) {
      throw new Error("seer config could not be loaded — see the startup log");
    }
    const { baseUrl, email, apiToken } = readJiraEnv();
    if (!baseUrl || !email || !apiToken) {
      throw new Error("Jira credentials are not configured (JIRA_BASE_URL/JIRA_EMAIL/JIRA_API_TOKEN)");
    }
    const jira = new JiraProvider({ baseUrl, email, apiToken });
    return collect(config, { "jira-work": jira }, { resultCap: config.resultCap });
  };
}

async function runServe(argv: string[]) {
  const resolved = resolveConfigPath({ args: argv, env: process.env, defaultPath: DEFAULT_CONFIG_PATH });
  const config = tryLoadConfig(resolved);
  const { baseUrl, email, apiToken } = readJiraEnv();
  const sanitizeError = createSanitizeError([baseUrl, email, apiToken].filter((v): v is string => Boolean(v)));

  const graphCache = new GraphCache({
    collect: buildCollectFn(config),
    refreshSeconds: config?.refreshSeconds ?? 30,
    fixtureGraph: loadFixtureGraph(),
    sanitizeError,
  });

  startServer({ port: config?.port ?? 4173, graphCache });
}

/**
 * On the default (unspecified) config path, an unreadable/invalid file falls back to
 * fixture-only mode, same as before this change. But when the path was explicitly named
 * (`--config`, `SEER_CONFIG`), never silently fall back — let the `ConfigError` propagate
 * so `main()`'s catch reports it and exits non-zero.
 */
function tryLoadConfig(resolved: ResolvedConfigPath): SeerConfig | null {
  if (resolved.explicit) {
    return loadConfig(resolved.path);
  }
  try {
    return loadConfig(resolved.path);
  } catch {
    return null;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const [subcommand, ...rest] = stripConfigFlag(argv);
  if (subcommand === undefined) {
    await runServe(argv);
  } else if (subcommand === "collect") {
    await runCollect(argv, rest[0]);
  } else if (subcommand === "serve") {
    await runServe(argv);
  } else {
    usage();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
