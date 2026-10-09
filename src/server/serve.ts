import { existsSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import { openBrowser } from "./open-browser.ts";
import type { GraphCache } from "./graph-cache.ts";

const PUBLIC_DIR = new URL("../../public", import.meta.url).pathname;
const PUBLIC_DIR_PREFIX = PUBLIC_DIR.endsWith(sep) ? PUBLIC_DIR : PUBLIC_DIR + sep;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function contentTypeFor(path: string): string {
  const dot = path.lastIndexOf(".");
  const ext = dot === -1 ? "" : path.slice(dot);
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

export interface ServeOptions {
  port: number;
  /** Serves `/graph.json`: runs (or reuses a cached) live collection, falling back to a stale snapshot or the committed fixture. */
  graphCache: GraphCache;
  /**
   * `Bun.serve`'s `idleTimeout`, in seconds. Must exceed the worst-case collect time — a cold
   * `/graph.json` runs the full collect inline, and Bun's default `idleTimeout` (10s) is shorter
   * than that can take, so the browser's first load would otherwise time out mid-collection.
   */
  idleTimeoutSeconds: number;
  openInBrowser?: boolean;
}

/**
 * Starts seer's viewer server. STRUCTURALLY loopback-only: the bind host below is a literal,
 * never read from config, env, or an argument — there is no flag that can make this public.
 */
export function startServer(options: ServeOptions): ReturnType<typeof Bun.serve> {
  const { port, graphCache, idleTimeoutSeconds } = options;

  // Kick off the collect now rather than waiting for the first request: GraphCache's
  // single-flight means a request arriving while this is in flight shares this same run
  // instead of starting a second one.
  void graphCache.getGraph();

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    idleTimeout: idleTimeoutSeconds,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/graph.json") {
        const graph = await graphCache.getGraph();
        return new Response(JSON.stringify(graph), {
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }

      const requested = url.pathname === "/" ? "/index.html" : url.pathname;
      // Resolve, then verify the result stays inside PUBLIC_DIR — collapses any `..` traversal
      // attempt down to a 404 rather than a path outside the served directory.
      const resolved = normalize(join(PUBLIC_DIR, requested));
      if (!(resolved === PUBLIC_DIR || resolved.startsWith(PUBLIC_DIR_PREFIX)) || !existsSync(resolved)) {
        return new Response("Not found", { status: 404 });
      }
      return new Response(Bun.file(resolved), { headers: { "content-type": contentTypeFor(resolved) } });
    },
  });

  const viewerUrl = `http://127.0.0.1:${server.port}/`;
  console.log(`seer viewer serving at ${viewerUrl} (/graph.json served live, cached, single-flight)`);
  if (options.openInBrowser !== false) {
    openBrowser(viewerUrl);
  }
  return server;
}
