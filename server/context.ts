import type { Database } from "bun:sqlite";
import type { Roots } from "./config";
import type { EventBus } from "./events";
import type { PeaksService } from "./peaks";
import type { RescanService } from "./rescan";

/** Everything a route needs; built once in `startServer` (or a test) and passed to each route module. */
export interface AppCtx {
  db: Database;
  roots: Roots;
  bus: EventBus;
  peaks: PeaksService;
  rescan: RescanService;
  /** SSE keep-alive interval. Must stay well under the server's idle timeout. */
  heartbeatMs?: number;
}

/** Hono environment shared by the app and its route modules. */
export type AppEnv = { Variables: { requestId: string } };
