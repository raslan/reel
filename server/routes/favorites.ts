import { Hono } from "hono";
import type { AppCtx, AppEnv } from "../context";
import { addFavorite, favoriteFiles, isIndexedFile, removeFavorite } from "../db";
import { NotFoundError } from "../errors";
import { toFileEntry } from "../library";
import { filePath } from "../schemas";
import { parse } from "../validate";

export function favoritesRoutes({ db }: AppCtx): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/api/favorites", (c) => c.json({ files: favoriteFiles(db).map(toFileEntry) }));

  app.post("/api/favorites", async (c) => {
    // A body that isn't JSON at all is validated as `undefined` and rejected like any other bad shape.
    const { path } = parse(filePath, await c.req.json().catch(() => undefined));
    if (!isIndexedFile(db, path)) throw new NotFoundError("not an indexed file");
    addFavorite(db, path);
    return c.json({ ok: true });
  });

  app.delete("/api/favorites", (c) => {
    removeFavorite(db, parse(filePath, c.req.query()).path);
    return c.json({ ok: true });
  });

  return app;
}
