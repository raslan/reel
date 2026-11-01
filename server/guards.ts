import type { MiddlewareHandler } from "hono";
import { ForbiddenError, UnsupportedMediaTypeError } from "./errors";

/**
 * Browsers will happily send cross-site "simple" requests (a form POST, a
 * no-cors fetch) to a server on the LAN or localhost. Writes therefore must
 * come from our own origin and carry a JSON content type, which a simple
 * cross-site request cannot set.
 */
export const sameOriginWrites: MiddlewareHandler = async (c, next) => {
  const method = c.req.method;
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const origin = c.req.header("origin");
    if (origin !== undefined) {
      let originHost: string | null = null;
      try {
        originHost = new URL(origin).host;
      } catch {
        // opaque origin ("null") → rejected below
      }
      if (originHost === null || originHost !== c.req.header("host")) {
        throw new ForbiddenError("cross-origin request blocked");
      }
    }
    const contentType = c.req.header("content-type")?.toLowerCase();
    if (method === "POST" && !contentType?.startsWith("application/json")) {
      throw new UnsupportedMediaTypeError("content-type must be application/json");
    }
  }
  await next();
};
