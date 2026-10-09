#!/usr/bin/env bun
import { loadConfig } from "./config/loader.ts";
import { parseGraph } from "./graph/validate.ts";
import { collect } from "./collector/collect.ts";
import { JiraProvider } from "./collector/jira.ts";
import { writeSnapshot } from "./collector/snapshot.ts";
import { startServer } from "./server/serve.ts";

const DEFAULT_CONFIG_PATH = new URL("../fixtures/seer.config.example.json", import.meta.url).pathname;
const DEFAULT_GRAPH_PATH = new URL("../graph.json", import.meta.url).pathname;

function usage(): never {
  console.error(
    [
      "Usage:",
      "  bun run seer                 Serve the most recent graph.json on localhost and open the browser (the one command).",
      "  bun run seer collect [config] Run every source's queries and write graph.json (default config: fixtures/seer.config.example.json).",
    ].join("\n"),
  );
  process.exit(1);
}

async function runCollect(configPath: string) {
  const config = loadConfig(configPath);
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;
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

async function runServe() {
  const config = tryLoadConfigForPort();
  startServer({ port: config?.port ?? 4173, graphPath: DEFAULT_GRAPH_PATH });
}

function tryLoadConfigForPort() {
  try {
    return loadConfig(DEFAULT_CONFIG_PATH);
  } catch {
    return null;
  }
}

async function main() {
  const [subcommand, ...rest] = process.argv.slice(2);
  if (subcommand === undefined) {
    await runServe();
  } else if (subcommand === "collect") {
    await runCollect(rest[0] ?? DEFAULT_CONFIG_PATH);
  } else if (subcommand === "serve") {
    await runServe();
  } else {
    usage();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
