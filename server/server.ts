import type { Database } from "bun:sqlite";
import { join, resolve } from "node:path";
import type { Server } from "bun";
import { createApp } from "./app";
import { type Roots, resolveRoots } from "./config";
import { openDb } from "./db";
import { createBus } from "./events";
import { applyWalk, candidateLibraries, rescanLibrary, runDurationPass, walkLibrary } from "./index";
import { PeaksService } from "./peaks";

/**
 * Serve the file under `prefix` that lives inside `root`.
 * Explicit traversal guard: decode → resolve → prefix check.
 * `Bun.file` as a response body natively provides Range/206, Content-Range,
 * sendfile, and Content-Type by extension.
 */
function serveFrom(req: Request, root: string, prefix: string): Promise<Response> {
  const url = new URL(req.url);
  let rest: string;
  try {
    rest = decodeURIComponent(url.pathname.slice(prefix.length));
  } catch {
    return Promise.resolve(new Response("not found", { status: 404 }));
  }
  const abs = resolve(root, rest);
  if (abs === root || !abs.startsWith(root + "/")) {
    return Promise.resolve(new Response("not found", { status: 404 }));
  }
  const file = Bun.file(abs);
  return file
    .exists()
    .then((exists) => (exists ? new Response(file) : new Response("not found", { status: 404 })));
}

export interface ServerOpts {
  /** Inject for tests; defaults to resolveRoots(). */
  roots?: Roots;
  port?: number;
  /** Static frontend dir; defaults to the repo's public/. */
  publicDir?: string;
}

export interface RunningServer {
  server: Server<unknown>;
  db: Database;
  stop: () => Promise<void>;
}

export async function startServer(opts: ServerOpts = {}): Promise<RunningServer> {
  const roots = opts.roots ?? (await resolveRoots());
  const db = openDb(join(roots.data, "reel.db"));
  const bus = createBus();
  const peaks = new PeaksService(db, roots, bus);
  const rescan = (lib: string) => rescanLibrary(db, roots, lib);
  const app = createApp({ db, roots, bus, peaks, rescan });

  // Startup: index root-level files + every library (fast walk; durations filled in later).
  applyWalk(db, "", await walkLibrary(roots, ""));
  for (const lib of await candidateLibraries(roots)) {
    applyWalk(db, lib.path, await walkLibrary(roots, lib.path));
  }

  // Frontend: serve the built app if present, else a placeholder.
  const publicDir = opts.publicDir ?? join(import.meta.dir, "..", "public");
  const indexFile = Bun.file(join(publicDir, "index.html"));
  const indexHtml = (await indexFile.exists())
    ? new Response(await indexFile.bytes(), {
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    : new Response("Reel server is running — frontend not built (run: bun run build)", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });

  const server = Bun.serve({
    port: opts.port ?? 8080,
    routes: {
      "/": indexHtml,
      "/assets/*": (req) => serveFrom(req, join(publicDir, "assets"), "/assets/"),
      "/audio/*": (req) => serveFrom(req, roots.libraries, "/audio/"),
    },
    fetch: app.fetch,
  });

  // Background: fill in durations, then tell clients the index changed.
  const durationPass = runDurationPass(db, roots).then((r) => {
    for (const lib of r.libraries) bus.emit("library-changed", { path: lib });
  });

  let stopping = false;
  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    server.stop(true);
    await durationPass; // no db writes after this
    await peaks.stop();
    db.close();
  };

  return { server, db, stop };
}

async function main(): Promise<void> {
  const { server, stop } = await startServer();
  const shutdown = (signal: string): void => {
    console.log(`reel: ${signal} received, shutting down`);
    void stop().then(() => process.exit(0));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  console.log(`reel: listening on http://localhost:${server.port}`);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("reel: fatal:", err);
    process.exit(1);
  });
}
