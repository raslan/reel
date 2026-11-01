import { Hono } from "hono";
import type { AppCtx, AppEnv } from "../context";
import { getFile } from "../db";
import { NotFoundError } from "../errors";
import { filePath } from "../schemas";
import { parse } from "../validate";

export function peaksRoutes({ db, peaks }: AppCtx): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/api/peaks", (c) => {
    const { path } = parse(filePath, c.req.query());
    const file = getFile(db, path);
    if (!file) throw new NotFoundError("not an indexed file");
    const state = peaks.getState(path, file.mtime);
    if (state === "ready") {
      // state === "ready" implies getCached() returns a row for this path
      const cached = peaks.getCached(path)!;
      return c.body(new Uint8Array(cached.data), 200, {
        "content-type": "application/octet-stream",
      });
    }
    if (state === "failed") return c.json({ error: "decode failed" }, 200);
    peaks.ensure(path, file.mtime);
    return c.json({ status: "pending" }, 202);
  });

  return app;
}
