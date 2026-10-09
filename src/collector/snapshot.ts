import { renameSync, writeFileSync } from "node:fs";
import type { Graph } from "../graph/schema.ts";

/**
 * Writes `graph` to `path` atomically (write-temp-then-rename): the viewer reads this file on
 * every page load, so a reader must never observe a half-written file.
 */
export function writeSnapshot(path: string, graph: Graph): void {
  const tmpPath = `${path}.tmp.${process.pid}`;
  writeFileSync(tmpPath, JSON.stringify(graph, null, 2), "utf-8");
  renameSync(tmpPath, path);
}
