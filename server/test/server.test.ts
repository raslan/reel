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

      const { server, stop, indexed } = await startServer({
        roots: { libraries: lib, data },
        port: 0,
      });
      await indexed;
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

  test("serves only indexed audio, not other files under the libraries root", async () => {
    const baseDir = await makeTempDir("reel-srv-");
    const lib = join(baseDir.dir, "lib");
    const data = join(baseDir.dir, "data");
    try {
      await mkdir(join(lib, "Podcasts"), { recursive: true });
      await mkdir(data, { recursive: true });
      await Bun.write(join(lib, "Podcasts/a.wav"), "audio");
      await Bun.write(join(lib, "Podcasts/notes.txt"), "private notes");
      await Bun.write(join(lib, "Podcasts/.hidden.wav"), "dot file");

      const { server, stop, indexed } = await startServer({
        roots: { libraries: lib, data },
        port: 0,
        watch: false, // the file added below must stay unindexed
      });
      await indexed;
      const base = `http://127.0.0.1:${server.port}`;
      expect((await fetch(`${base}/audio/Podcasts/a.wav`)).status).toBe(200);
      const notes = await fetch(`${base}/audio/Podcasts/notes.txt`);
      expect(notes.status).toBe(404);
      expect(await notes.text()).not.toContain("private notes");
      expect((await fetch(`${base}/audio/Podcasts/.hidden.wav`)).status).toBe(404);

      // A new file isn't playable until it's been indexed.
      await Bun.write(join(lib, "Podcasts/new.wav"), "audio");
      expect((await fetch(`${base}/audio/Podcasts/new.wav`)).status).toBe(404);
      await stop();
    } finally {
      await baseDir.cleanup();
    }
  });

  test("serves the install manifest and icons from the web root, and nothing else there", async () => {
    const baseDir = await makeTempDir("reel-srv-");
    const pub = join(baseDir.dir, "public");
    try {
      await mkdir(join(baseDir.dir, "lib"), { recursive: true });
      await mkdir(pub, { recursive: true });
      await mkdir(join(baseDir.dir, "data"), { recursive: true });
      await Bun.write(join(pub, "manifest.webmanifest"), '{"name":"Reel"}');
      await Bun.write(join(pub, "icon.svg"), "<svg/>");
      await Bun.write(join(pub, "favicon.ico"), "ico");
      await Bun.write(join(pub, "private.txt"), "not a root file");

      const { server, stop } = await startServer({
        roots: { libraries: join(baseDir.dir, "lib"), data: join(baseDir.dir, "data") },
        port: 0,
        publicDir: pub,
        watch: false,
      });
      const base = `http://127.0.0.1:${server.port}`;
      const manifest = await fetch(`${base}/manifest.webmanifest`);
      expect(manifest.status).toBe(200);
      expect(manifest.headers.get("content-type")).toContain("json");
      expect(await manifest.json()).toEqual({ name: "Reel" });
      expect((await fetch(`${base}/icon.svg`)).headers.get("content-type")).toContain("svg");
      expect((await fetch(`${base}/favicon.ico`)).status).toBe(200);
      expect((await fetch(`${base}/icon-512.png`)).status).toBe(404); // listed, but not built here
      expect((await fetch(`${base}/private.txt`)).status).toBe(404);
      await stop();
    } finally {
      await baseDir.cleanup();
    }
  });

  test("the event stream survives longer than the idle timeout thanks to heartbeats", async () => {
    const baseDir = await makeTempDir("reel-srv-");
    try {
      const lib = join(baseDir.dir, "lib");
      await mkdir(lib, { recursive: true });
      await mkdir(join(baseDir.dir, "data"), { recursive: true });
      const { server, stop, indexed } = await startServer({
        roots: { libraries: lib, data: join(baseDir.dir, "data") },
        port: 0,
        publicDir: join(baseDir.dir, "public"),
        idleTimeoutS: 1,
        heartbeatMs: 300,
      });
      await indexed;
      const res = await fetch(`http://127.0.0.1:${server.port}/api/events`);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let text = "";
      const t0 = performance.now();
      while (performance.now() - t0 < 2500) {
        const { done, value } = await reader.read();
        expect(done).toBe(false); // would be true if the server had cut the stream
        text += decoder.decode(value, { stream: true });
      }
      expect(text.match(/: hb/g)?.length).toBeGreaterThanOrEqual(3);
      await reader.cancel();
      await stop();
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
