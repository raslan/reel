import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppCtx, AppEnv } from "../context";

const DEFAULT_HEARTBEAT_MS = 15_000;

/** Server-sent events: library/peaks/rescan notifications, kept alive with comment frames. */
export function eventsRoutes({ bus, heartbeatMs = DEFAULT_HEARTBEAT_MS }: AppCtx): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/api/events", (c) =>
    streamSSE(c, async (sse) => {
      let unsubscribe = () => {};
      unsubscribe = bus.subscribe((event, data) => {
        sse
          .writeSSE({ event, data: data === undefined ? "" : JSON.stringify(data) })
          .catch(() => undefined); // client went away; abort handler unsubscribes
      });
      await sse.write(": open\n\n"); // first frame: signals the subscription is live
      const heartbeat = setInterval(() => {
        sse.write(": hb\n\n").catch(() => undefined);
      }, heartbeatMs);
      try {
        await new Promise<void>((resolve) => sse.onAbort(() => resolve()));
      } finally {
        clearInterval(heartbeat);
        unsubscribe();
      }
    }),
  );

  return app;
}
