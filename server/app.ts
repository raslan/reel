import { Hono } from "hono";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import type { Roots } from "./config";
import type { EventBus } from "./events";
import type { PeaksService } from "./peaks";
import { candidateLibraries, type WalkDiff } from "./index";
import { addFavorite, countFilesByLibrary, favoritePaths, folderFiles, getEnabledLibraries, isIndexedFile, removeFavorite, searchFiles, setEnabledLibraries } from "./db";

export interface AppCtx {
  db: Database;
  roots: Roots;
  bus: EventBus;
  peaks: PeaksService;
  /** Walk + duration pass for one library. */
  rescan: (library: string) => Promise<WalkDiff>;
}

const byNameCI = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

export function createApp(ctx: AppCtx): Hono {
  const { db, roots, bus } = ctx;
  const app = new Hono();

  app.onError((err, c) => {
    console.error("reel:", err);
    return c.json({ error: "internal error" }, 500);
  });

  app.notFound((c) => {
    if (c.req.path.startsWith("/api/")) return c.json({ error: "not found" }, 404);
    return c.text("not found", 404);
  });

  app.get("/api/health", (c) => c.json({ ok: true }));

  /* ---------- libraries ---------- */

  app.get("/api/libraries", async (c) => {
    const candidates = await candidateLibraries(roots);
    const enabled = new Set(getEnabledLibraries(db));
    return c.json({
      libraries: candidates.map((lib) => ({
        name: lib.name,
        path: lib.path,
        audioFiles: countFilesByLibrary(db, lib.path),
        enabled: enabled.has(lib.path),
      })),
    });
  });

  app.put("/api/libraries", async (c) => {
    const body = await c.req.json<{ enabled?: unknown }>().catch(() => null);
    if (!body || !Array.isArray(body.enabled) || body.enabled.some((n) => typeof n !== "string")) {
      return c.json({ error: "expected { enabled: string[] }" }, 400);
    }
    const candidates = new Set((await candidateLibraries(roots)).map((l) => l.path));
    const next = [...new Set(body.enabled as string[])].filter((n) => candidates.has(n));
    const prev = getEnabledLibraries(db);
    setEnabledLibraries(db, next);
    bus.emit("libraries-changed");
    for (const lib of next) {
      if (prev.includes(lib)) continue;
      void ctx.rescan(lib).then((d) => {
        if (d.added + d.removed + d.changed > 0) bus.emit("library-changed", { path: lib });
      });
    }
    return c.json({ ok: true });
  });

  /* ---------- list ---------- */

  app.get("/api/list", async (c) => {
    const p = c.req.query("path") ?? "";
    if (!(await isKnownFolder(p))) return c.json({ error: "not found" }, 404);
    let folders: { name: string; path: string }[];
    if (p === "") {
      const enabled = new Set(getEnabledLibraries(db));
      folders = (await candidateLibraries(roots)).filter((l) => enabled.has(l.path));
    } else {
      const dir = join(roots.libraries, p);
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
      folders = entries
        .filter((e) => e.isDirectory())
        .map((e) => ({ name: e.name, path: join(p, e.name) }))
        .sort(byNameCI);
    }
    const files = folderFiles(db, p).map((r) => ({
      name: r.name,
      path: r.path,
      duration: r.duration,
      size: r.size,
    }));
    return c.json({ folders, files });
  });

  async function isKnownFolder(p: string): Promise<boolean> {
    if (p === "") return true;
    const first = p.split("/")[0]!;
    if (!getEnabledLibraries(db).includes(first)) return false;
    try {
      const st = await stat(join(roots.libraries, p));
      return st.isDirectory();
    } catch {
      return false;
    }
  }

  /* ---------- search ---------- */

  app.get("/api/search", (c) => {
    const q = (c.req.query("q") ?? "").trim();
    const files = searchFiles(db, q, getEnabledLibraries(db)).map((r) => ({
      name: r.name,
      path: r.path,
      duration: r.duration,
    }));
    return c.json({ files, total: files.length });
  });

  /* ---------- favorites ---------- */

  app.get("/api/favorites", (c) =>
    c.json({ paths: favoritePaths(db, getEnabledLibraries(db)) }),
  );

  app.post("/api/favorites", async (c) => {
    const body = await c.req.json<{ path?: string }>().catch(() => null);
    const path = body?.path ?? "";
    if (!path || !isIndexedFile(db, path)) {
      return c.json({ error: "not an indexed file" }, 404);
    }
    addFavorite(db, path);
    return c.json({ ok: true });
  });

  app.delete("/api/favorites", (c) => {
    removeFavorite(db, c.req.query("path") ?? "");
    return c.json({ ok: true });
  });
  return app;
}
