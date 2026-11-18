import { Hono } from "hono";
import type { AppCtx, AppEnv } from "../context";
import { deleteFolderAlias, folderAliases, setFolderAlias } from "../db";
import { folderAliasBody, folderAliasQuery } from "../schemas";
import { parse } from "../validate";

/**
 * Folder display names. Purely presentational: nothing here reads or writes the
 * filesystem, and the real folder path is unchanged — navigation and audio
 * serving keep using it.
 */
export function folderAliasRoutes({ db }: AppCtx): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/api/folder-aliases", (c) => c.json({ aliases: folderAliases(db) }));

  app.post("/api/folder-aliases", async (c) => {
    // A body that isn't JSON at all is validated as `undefined` and rejected like any other bad shape.
    const { path, name } = parse(folderAliasBody, await c.req.json().catch(() => undefined));
    setFolderAlias(db, path, name);
    return c.json({ ok: true });
  });

  app.delete("/api/folder-aliases", (c) => {
    deleteFolderAlias(db, parse(folderAliasQuery, c.req.query()).path);
    return c.json({ ok: true });
  });

  return app;
}