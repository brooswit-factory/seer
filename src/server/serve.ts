import { existsSync, readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { openBrowser } from "./open-browser.ts";

const PUBLIC_DIR = new URL("../../public", import.meta.url).pathname;

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
  /** Path to the graph JSON to serve at `/graph.json`. Falls back to the committed fixture when absent, so the one command always shows something. */
  graphPath: string;
  openInBrowser?: boolean;
}

/**
 * Starts seer's viewer server. STRUCTURALLY loopback-only: the bind host below is a literal,
 * never read from config, env, or an argument — there is no flag that can make this public.
 */
export function startServer(options: ServeOptions): ReturnType<typeof Bun.serve> {
  const { port, graphPath } = options;
  const fallbackGraphPath = new URL("../../fixtures/graph.example.json", import.meta.url).pathname;

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/graph.json") {
        const path = existsSync(graphPath) ? graphPath : fallbackGraphPath;
        return new Response(readFileSync(path, "utf-8"), {
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }

      const requested = url.pathname === "/" ? "/index.html" : url.pathname;
      // Resolve, then verify the result stays inside PUBLIC_DIR — collapses any `..` traversal
      // attempt down to a 404 rather than a path outside the served directory.
      const resolved = normalize(join(PUBLIC_DIR, requested));
      if (!resolved.startsWith(PUBLIC_DIR) || !existsSync(resolved)) {
        return new Response("Not found", { status: 404 });
      }
      return new Response(Bun.file(resolved), { headers: { "content-type": contentTypeFor(resolved) } });
    },
  });

  const viewerUrl = `http://127.0.0.1:${server.port}/`;
  console.log(`seer viewer serving at ${viewerUrl} (graph: ${existsSync(graphPath) ? graphPath : `${fallbackGraphPath} [fallback fixture — no graph.json yet]`})`);
  if (options.openInBrowser !== false) {
    openBrowser(viewerUrl);
  }
  return server;
}
