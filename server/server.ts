import type { Database } from "bun:sqlite";
import { join, resolve } from "node:path";
import type { Server } from "bun";
import { createApp } from "./app";
import { type Roots, resolveRoots } from "./config";
import { isIndexedFile, openDb } from "./db";
import { createBus } from "./events";
import { errFields, log } from "./log";
import { PeaksService } from "./peaks";
import { RescanService } from "./rescan";
import { type WatchOpts, watchLibraries } from "./watch";

/** Seconds a connection may sit silent. Well above the SSE heartbeat; Bun's default (10s) would cut the event stream. */
const DEFAULT_IDLE_TIMEOUT_S = 120;

/**
 * Serve the file under `prefix` that lives inside `root`.
 * Explicit traversal guard: decode → resolve → prefix check, then `allow`
 * gets the root-relative path for any further restriction.
 * `Bun.file` as a response body natively provides Range/206, Content-Range,
 * sendfile, and Content-Type by extension.
 */
function serveFrom(
  req: Request,
  root: string,
  prefix: string,
  allow: (rel: string) => boolean = () => true,
): Promise<Response> {
  const url = new URL(req.url);
  let rest: string;
  try {
    rest = decodeURIComponent(url.pathname.slice(prefix.length));
  } catch {
    return Promise.resolve(new Response("not found", { status: 404 }));
  }
  const abs = resolve(root, rest);
  if (abs === root || !abs.startsWith(root + "/") || !allow(abs.slice(root.length + 1))) {
    return Promise.resolve(new Response("not found", { status: 404 }));
  }
  const file = Bun.file(abs);
  return file
    .exists()
    .then((exists) => (exists ? new Response(file) : new Response("not found", { status: 404 })));
}

/** Files the frontend build puts at the web root (icons and the install manifest); everything else is under /assets. */
const ROOT_FILES = [
  "favicon.ico",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
  "manifest.webmanifest",
] as const;

export interface ServerOpts {
  /** Inject for tests; defaults to resolveRoots(). */
  roots?: Roots;
  port?: number;
  /** Static frontend dir; defaults to the repo's public/. */
  publicDir?: string;
  /** Override for tests; see DEFAULT_IDLE_TIMEOUT_S. */
  idleTimeoutS?: number;
  /** Override for tests; defaults to the app's SSE heartbeat. */
  heartbeatMs?: number;
  /** Tune the library watcher, or `false` to leave it off. */
  watch?: WatchOpts | false;
}

export interface RunningServer {
  server: Server<unknown>;
  db: Database;
  /** Resolves when the startup index (walk + durations) has finished. The server is usable before that. */
  indexed: Promise<void>;
  stop: () => Promise<void>;
}

export async function startServer(opts: ServerOpts = {}): Promise<RunningServer> {
  const roots = opts.roots ?? (await resolveRoots());
  const db = openDb(join(roots.data, "reel.db"));
  const bus = createBus();
  const peaks = new PeaksService(db, roots, bus);
  const rescan = new RescanService(db, roots, bus);
  const app = createApp({ db, roots, bus, peaks, rescan, heartbeatMs: opts.heartbeatMs });

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
    idleTimeout: opts.idleTimeoutS ?? DEFAULT_IDLE_TIMEOUT_S,
    routes: {
      "/": indexHtml,
      ...Object.fromEntries(
        ROOT_FILES.map((name) => [`/${name}`, (req: Request) => serveFrom(req, publicDir, "/")]),
      ),
      "/assets/*": (req) => serveFrom(req, join(publicDir, "assets"), "/assets/"),
      // Only indexed audio is served, never arbitrary files under the libraries root.
      "/audio/*": (req) =>
        serveFrom(req, roots.libraries, "/audio/", (rel) => isIndexedFile(db, rel)),
    },
    fetch: app.fetch,
  });

  // Index in the background so a big library never delays the health check; clients
  // refresh via SSE (library-changed / rescan-finished) as it lands.
  rescan.start();
  const indexed = rescan.whenIdle();
  // Pick up files added, removed or edited on disk without a manual rescan.
  const stopWatching =
    opts.watch === false ? () => {} : watchLibraries(roots.libraries, () => rescan.request(), opts.watch);

  let stopping = false;
  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    stopWatching();
    server.stop(true);
    await rescan.whenIdle(); // no db writes after this
    await peaks.stop();
    db.close();
  };

  return { server, db, indexed, stop };
}

async function main(): Promise<void> {
  const { server, stop } = await startServer();
  const shutdown = (signal: string): void => {
    log("info", "shutting down", { signal });
    void stop().then(() => process.exit(0));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  log("info", "listening", { port: server.port });
}

if (import.meta.main) {
  main().catch((err) => {
    log("error", "fatal", errFields(err));
    process.exit(1);
  });
}
