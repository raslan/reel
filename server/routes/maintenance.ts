import { Hono } from "hono";
import type { AppCtx, AppEnv } from "../context";
import { clearDb } from "../db";
import { ConflictError } from "../errors";

/** Index upkeep: start/inspect a rescan, wipe the index. */
export function maintenanceRoutes({ db, bus, peaks, rescan }: AppCtx): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/api/rescan", (c) => c.json(rescan.status()));

  app.post("/api/rescan", (c) => {
    if (!rescan.start()) throw new ConflictError("a rescan is already running");
    return c.json({ status: "started" }, 202);
  });

  app.post("/api/clear", (c) => {
    if (rescan.status().running) {
      throw new ConflictError("a rescan is running; try again when it finishes");
    }
    clearDb(db);
    peaks.clear();
    bus.emit("libraries-changed");
    return c.json({ ok: true });
  });

  return app;
}
