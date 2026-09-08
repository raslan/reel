import { describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import * as net from "node:net";
import { join } from "node:path";
import { startServer } from "../server";
import { makeTempDir } from "./helpers";

/** Raw HTTP GET (no URL normalization) — traversal tests can't be masked by fetch. */
async function rawGet(base: string, path: string): Promise<{ status: number; body: string }> {
  const url = new URL(base);
  const {
    promise,
    resolve: done,
    reject,
  } = Promise.withResolvers<{ status: number; body: string }>();
  const sock = net.connect({ host: url.hostname, port: Number(url.port) }, () => {
    sock.write(
      `GET ${path} HTTP/1.1\r\nHost: ${url.hostname}:${url.port}\r\nConnection: close\r\n\r\n`,
    );
  });
  const chunks: Buffer[] = [];
  sock.on("data", (c: Buffer) => chunks.push(c));
  sock.on("end", () => {
    const raw = Buffer.concat(chunks).toString("latin1");
    const status = Number(raw.split(" ")[1]);
    const body = raw.split("\r\n\r\n").slice(1).join("\r\n\r\n");
    done({ status, body });
  });
  sock.on("error", reject);
  return promise;
}

describe("server composition", () => {
  test("serves audio with Range support and blocks traversal", async () => {
    const baseDir = await makeTempDir("reel-srv-");
    const lib = join(baseDir.dir, "lib");
    const data = join(baseDir.dir, "data");
    try {
      await mkdir(join(lib, "Podcasts"), { recursive: true });
      await mkdir(data, { recursive: true });
      await Bun.write(join(baseDir.dir, "secret.txt"), "SECRET-CONTENT");

      const big = Buffer.alloc(1024 * 1024);
      for (let i = 0; i < big.length; i++) big[i] = i % 251;
      await Bun.write(join(lib, "Podcasts/big.wav"), big);

      const { server, stop } = await startServer({ roots: { libraries: lib, data }, port: 0 });
      const base = `http://127.0.0.1:${server.port}`;

      const full = await fetch(`${base}/audio/Podcasts/big.wav`);
      expect(full.status).toBe(200);
      expect(full.headers.get("content-length")).toBe(String(big.length));
      expect(full.headers.get("content-type")).toBe("audio/x-wav");

      const ranged = await fetch(`${base}/audio/Podcasts/big.wav`, {
        headers: { range: "bytes=100-199" },
      });
      expect(ranged.status).toBe(206);
      expect(ranged.headers.get("content-range")).toBe(`bytes 100-199/${big.length}`);
      expect(Buffer.from(await ranged.arrayBuffer()).equals(big.subarray(100, 200))).toBe(true);

      for (const evil of ["/audio/../secret.txt", "/audio/..%2Fsecret.txt"]) {
        const r = await rawGet(base, evil);
        expect(r.status).toBe(404);
        expect(r.body).not.toContain("SECRET-CONTENT");
      }

      expect((await fetch(`${base}/audio/nope.wav`)).status).toBe(404);
      expect((await fetch(`${base}/nope`)).status).toBe(404);
      expect(await (await fetch(`${base}/api/health`)).json()).toEqual({ ok: true });

      await stop();
      let refused = false;
      try {
        await fetch(`${base}/api/health`);
      } catch {
        refused = true;
      }
      expect(refused).toBe(true);
    } finally {
      await baseDir.cleanup();
    }
  });

  test("serves a placeholder index when the frontend is not built", async () => {
    const baseDir = await makeTempDir("reel-srv-");
    try {
      const lib = join(baseDir.dir, "lib");
      await mkdir(lib, { recursive: true });
      await mkdir(join(baseDir.dir, "data"), { recursive: true });
      const { server, stop } = await startServer({
        roots: { libraries: lib, data: join(baseDir.dir, "data") },
        port: 0,
        publicDir: join(baseDir.dir, "public"),
      });
      const res = await fetch(`http://127.0.0.1:${server.port}/`);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("frontend not built");
      await stop();
    } finally {
      await baseDir.cleanup();
    }
  });

  test("serves the built index when present", async () => {
    const baseDir = await makeTempDir("reel-srv-");
    try {
      const lib = join(baseDir.dir, "lib");
      await mkdir(lib, { recursive: true });
      await mkdir(join(baseDir.dir, "data"), { recursive: true });
      const pub = join(baseDir.dir, "public");
      await mkdir(pub, { recursive: true });
      await Bun.write(join(pub, "index.html"), "<!doctype html><title>Reel</title>");
      const { server, stop } = await startServer({
        roots: { libraries: lib, data: join(baseDir.dir, "data") },
        port: 0,
        publicDir: pub,
      });
      const res = await fetch(`http://127.0.0.1:${server.port}/`);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("<title>Reel</title>");
      await stop();
    } finally {
      await baseDir.cleanup();
    }
  });
});
