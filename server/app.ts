import { Hono } from "hono";
import type { AppCtx, AppEnv } from "./context";
import { AppError, ValidationError } from "./errors";
import { sameOriginWrites } from "./guards";
import { errFields, log } from "./log";
import { browseRoutes } from "./routes/browse";
import { eventsRoutes } from "./routes/events";
import { favoritesRoutes } from "./routes/favorites";
import { maintenanceRoutes } from "./routes/maintenance";
import { peaksRoutes } from "./routes/peaks";

/**
 * Cross-cutting concerns only (request id, write guard, error mapping); every
 * endpoint lives in its resource's module under `routes/`.
 */
export function createApp(ctx: AppCtx): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    const id = crypto.randomUUID();
    c.set("requestId", id);
    c.header("x-request-id", id);
    await next();
  });

  app.use("/api/*", sameOriginWrites);

  app.onError((err, c) => {
    if (err instanceof ValidationError) return c.json({ error: err.message, issues: err.issues }, 400);
    if (err instanceof AppError) return c.json({ error: err.message }, err.status);
    log("error", "unhandled error", {
      requestId: c.get("requestId"),
      method: c.req.method,
      path: c.req.path,
      ...errFields(err),
    });
    return c.json({ error: "internal error" }, 500);
  });

  app.notFound((c) => {
    if (c.req.path.startsWith("/api/")) return c.json({ error: "not found" }, 404);
    return c.text("not found", 404);
  });

  app.get("/api/health", (c) => c.json({ ok: true }));
  app.route("/", browseRoutes(ctx));
  app.route("/", favoritesRoutes(ctx));
  app.route("/", peaksRoutes(ctx));
  app.route("/", maintenanceRoutes(ctx));
  app.route("/", eventsRoutes(ctx));

  return app;
}
