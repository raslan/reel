import { Hono } from "hono";
import type { AppCtx, AppEnv } from "../context";
import { countFilesByLibrary } from "../db";
import { candidateLibraries } from "../index";
import { listFolder, searchLibrary } from "../library";
import { folderQuery, searchQuery } from "../schemas";
import { parse } from "../validate";

/** Read-only views of the index: library overview, folder listing, filename search. */
export function browseRoutes({ db, roots }: AppCtx): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/api/libraries", async (c) => {
    const candidates = await candidateLibraries(roots);
    return c.json({
      libraries: candidates.map((lib) => ({
        name: lib.name,
        path: lib.path,
        audioFiles: countFilesByLibrary(db, lib.path),
      })),
    });
  });

  app.get("/api/list", async (c) => {
    const { path } = parse(folderQuery, c.req.query());
    return c.json(await listFolder({ db, roots }, path));
  });

  app.get("/api/search", (c) => c.json(searchLibrary(db, parse(searchQuery, c.req.query()))));

  return app;
}
