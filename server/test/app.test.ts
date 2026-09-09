import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  type FavoritesBody,
  json,
  type LibrariesBody,
  type ListBody,
  makeStack,
  type SearchBody,
  waitForEvent,
  writeWav,
} from "./helpers";

/** Subscribe to the SSE stream. `connected` resolves on the first frame (server signals it); `until` when a frame matches. */
async function readSSE(
  base: string,
  until: (event: string, data: string) => boolean,
  timeoutMs = 8000,
): Promise<{ connected: Promise<void>; until: Promise<void> }> {
  const res = await fetch(`${base}/api/events`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/event-stream");
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let signalConnected: () => void = () => {};
  const connected = new Promise<void>((r) => (signalConnected = r));
  const untilP = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("SSE timeout")), timeoutMs);
    void (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) throw new Error("SSE stream closed");
          buf += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf("\n\n")) !== -1) {
            const frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            if (frame.startsWith(":")) {
              signalConnected();
              continue;
            }
            const event = /event: (.+)/.exec(frame)?.[1] ?? "message";
            const data = /data: (.+)/.exec(frame)?.[1] ?? "";
            if (until(event, data)) {
              clearTimeout(timer);
              await reader.cancel();
              resolve();
              return;
            }
          }
        }
      } catch (err) {
        clearTimeout(timer);
        reject(err as Error);
      }
    })();
  });
  return { connected, until: untilP };
}

describe("GET /api/health", () => {
  test("returns ok", async () => {
    const s = await makeStack();
    try {
      const res = await fetch(`${s.base}/api/health`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    } finally {
      await s.cleanup();
    }
  });
});

describe("GET /api/libraries", () => {
  test("lists candidates with file counts", async () => {
    const s = await makeStack({
      files: {
        "Podcasts/a.wav": "x",
        "Field Recordings/b.wav": "x",
        "Field Recordings/Sub/c.wav": "x",
      },
    });
    try {
      await s.rescan("Podcasts");
      const res = await fetch(`${s.base}/api/libraries`);
      expect(res.status).toBe(200);
      const body = await json<LibrariesBody>(res);
      expect(body.libraries).toEqual([
        { name: "Field Recordings", path: "Field Recordings", audioFiles: 0 },
        { name: "Podcasts", path: "Podcasts", audioFiles: 1 },
      ]);
    } finally {
      await s.cleanup();
    }
  });
});

describe("GET /api/list", () => {
  test("returns folders (live) and files (indexed) for a folder", async () => {
    const s = await makeStack({
      files: {
        "loose.mp3": "x",
        "Podcasts/b.mp3": "x",
        "Podcasts/Sub/c.wav": "x",
      },
    });
    try {
      await writeWav(join(s.roots.libraries, "Podcasts/a.wav"), 3000, 440);
      await s.rescan("Podcasts");
      await s.rescan("");
      const res = await fetch(`${s.base}/api/list?path=Podcasts`);
      expect(res.status).toBe(200);
      const body = await json<ListBody>(res);
      expect(body.folders).toEqual([{ name: "Sub", path: "Podcasts/Sub" }]);
      expect(body.files.map((f) => f.name)).toEqual(["a.wav", "b.mp3"]);
      expect(body.files[0]).toEqual({
        name: "a.wav",
        path: "Podcasts/a.wav",
        duration: expect.any(Number),
        size: expect.any(Number),
      });
      const sub = await json<ListBody>(await fetch(`${s.base}/api/list?path=Podcasts/Sub`));
      expect(sub.files.map((f) => f.name)).toEqual(["c.wav"]);
      const root = await json<ListBody>(await fetch(`${s.base}/api/list`));
      expect(root.folders).toEqual([{ name: "Podcasts", path: "Podcasts" }]);
      expect(root.files.map((f) => f.name)).toEqual(["loose.mp3"]);
    } finally {
      await s.cleanup();
    }
  });

  test("404 for unknown folders and traversal attempts", async () => {
    const s = await makeStack({ files: { "Podcasts/a.wav": "x" } });
    try {
      expect((await fetch(`${s.base}/api/list?path=Ghost`)).status).toBe(404);
      expect((await fetch(`${s.base}/api/list?path=Podcasts/Ghost`)).status).toBe(404);
      expect((await fetch(`${s.base}/api/list?path=..%2F..`)).status).toBe(404);
    } finally {
      await s.cleanup();
    }
  });
});

describe("GET /api/search", () => {
  test("case-insensitive substring, unbounded, empty q returns all files", async () => {
    const s = await makeStack({
      files: {
        "Podcasts/Ep-12.mp3": "x",
        "Podcasts/ep-13.mp3": "x",
        "Field Recordings/rain.wav": "x",
      },
    });
    try {
      await s.rescan("Podcasts");
      await s.rescan("Field Recordings");
      const q = await json<SearchBody>(await fetch(`${s.base}/api/search?q=ep-1`));
      expect(q.files.map((f) => f.name).sort()).toEqual(["Ep-12.mp3", "ep-13.mp3"]);
      expect(q.total).toBe(2);
      const all = await json<SearchBody>(await fetch(`${s.base}/api/search?q=`));
      expect(all.total).toBe(3);
      const none = await json<SearchBody>(await fetch(`${s.base}/api/search?q=zzz`));
      expect(none.files).toEqual([]);
    } finally {
      await s.cleanup();
    }
  });

});

describe("favorites", () => {
  test("add, list, remove round-trip; 404 for unknown path", async () => {
    const s = await makeStack({ files: { "Podcasts/a.mp3": "x" } });
    try {
      await s.rescan("Podcasts");
      const add = await fetch(`${s.base}/api/favorites`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: "Podcasts/a.mp3" }),
      });
      expect(add.status).toBe(200);
      expect(await json<FavoritesBody>(await fetch(`${s.base}/api/favorites`))).toEqual({
        paths: ["Podcasts/a.mp3"],
      });
      const del = await fetch(`${s.base}/api/favorites?path=Podcasts/a.mp3`, { method: "DELETE" });
      expect(del.status).toBe(200);
      expect(await json<FavoritesBody>(await fetch(`${s.base}/api/favorites`))).toEqual({
        paths: [],
      });
      const bad = await fetch(`${s.base}/api/favorites`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: "Podcasts/ghost.mp3" }),
      });
      expect(bad.status).toBe(404);
    } finally {
      await s.cleanup();
    }
  });

  test("adding the same favorite twice is idempotent", async () => {
    const s = await makeStack({ files: { "Podcasts/a.mp3": "x" } });
    try {
      await s.rescan("Podcasts");
      const body = JSON.stringify({ path: "Podcasts/a.mp3" });
      for (let i = 0; i < 2; i++) {
        const res = await fetch(`${s.base}/api/favorites`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        });
        expect(res.status).toBe(200);
      }
      expect(await json<FavoritesBody>(await fetch(`${s.base}/api/favorites`))).toEqual({
        paths: ["Podcasts/a.mp3"],
      });
    } finally {
      await s.cleanup();
    }
  });
});

describe("GET /api/peaks", () => {
  test("202 pending on first request, then 200 with 1024 float32 buckets", async () => {
    const s = await makeStack({});
    try {
      await writeWav(join(s.roots.libraries, "Podcasts/tone.wav"), 1);
      await s.rescan("Podcasts");

      const ready = waitForEvent(s, "Podcasts/tone.wav", "peaks-ready");
      const first = await fetch(`${s.base}/api/peaks?path=Podcasts/tone.wav`);
      expect(first.status).toBe(202);
      expect(await first.json()).toEqual({ status: "pending" });

      await ready;
      const res = await fetch(`${s.base}/api/peaks?path=Podcasts/tone.wav`);
      expect(res.status).toBe(200);
      const buf = new Uint8Array(await res.arrayBuffer());
      expect(buf.length).toBe(1024 * 4);
    } finally {
      await s.stopPeaks();
      await s.cleanup();
    }
  });

  test("failed decode → 200 json error; unknown path → 404", async () => {
    const s = await makeStack({});
    try {
      await Bun.write(join(s.roots.libraries, "Podcasts/bad.wav"), "not audio");
      await s.rescan("Podcasts");

      const failed = waitForEvent(s, "Podcasts/bad.wav", "peaks-failed");
      await fetch(`${s.base}/api/peaks?path=Podcasts/bad.wav`);
      await failed;
      const res = await fetch(`${s.base}/api/peaks?path=Podcasts/bad.wav`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ error: "decode failed" });
      expect((await fetch(`${s.base}/api/peaks?path=Podcasts/ghost.wav`)).status).toBe(404);
    } finally {
      await s.stopPeaks();
      await s.cleanup();
    }
  });
});

describe("POST /api/rescan", () => {
  test("returns 202 and picks up new files, including root-level", async () => {
    const s = await makeStack({ files: { "Podcasts/a.wav": "x" } });
    try {
      await s.rescan("Podcasts");
      await Bun.write(join(s.roots.libraries, "Podcasts/b.wav"), "x");
      await Bun.write(join(s.roots.libraries, "loose.wav"), "x");
      const changed = waitForEvent(s, "Podcasts", "library-changed");
      const rootChanged = waitForEvent(s, "", "library-changed");
      const res = await fetch(`${s.base}/api/rescan`, { method: "POST" });
      expect(res.status).toBe(202);
      expect(await res.json()).toEqual({ status: "started" });
      await changed;
      await rootChanged;
      const list = await json<ListBody>(await fetch(`${s.base}/api/list?path=Podcasts`));
      expect(list.files.map((f) => f.path)).toEqual(["Podcasts/a.wav", "Podcasts/b.wav"]);
      const root = await json<ListBody>(await fetch(`${s.base}/api/list`));
      expect(root.folders).toEqual([{ name: "Podcasts", path: "Podcasts" }]);
      expect(root.files.map((f) => f.name)).toEqual(["loose.wav"]);
    } finally {
      await s.cleanup();
    }
  });
});

describe("POST /api/clear", () => {
  test("wipes index, favorites, and peaks; a rescan rebuilds the index", async () => {
    const s = await makeStack({ files: { "Podcasts/a.wav": "x" } });
    try {
      await s.rescan("Podcasts");
      await fetch(`${s.base}/api/favorites`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: "Podcasts/a.wav" }),
      });
      expect(await json<FavoritesBody>(await fetch(`${s.base}/api/favorites`))).toEqual({
        paths: ["Podcasts/a.wav"],
      });

      const sse = await readSSE(s.base, (event) => event === "libraries-changed");
      await sse.connected;
      const res = await fetch(`${s.base}/api/clear`, { method: "POST" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      await sse.until;

      expect(await json<ListBody>(await fetch(`${s.base}/api/list?path=Podcasts`))).toEqual({
        folders: [],
        files: [],
      });
      expect(await json<FavoritesBody>(await fetch(`${s.base}/api/favorites`))).toEqual({
        paths: [],
      });

      const changed = waitForEvent(s, "Podcasts", "library-changed");
      await fetch(`${s.base}/api/rescan`, { method: "POST" });
      await changed;
      const rebuilt = await json<ListBody>(await fetch(`${s.base}/api/list?path=Podcasts`));
      expect(rebuilt.files.map((f) => f.path)).toEqual(["Podcasts/a.wav"]);
    } finally {
      await s.cleanup();
    }
  });
});

describe("SSE /api/events", () => {
  test("delivers library-changed after a rescan that changed the index", async () => {
    const s = await makeStack({ files: { "Podcasts/a.wav": "x" } });
    try {
      await s.rescan("Podcasts");
      const sse = await readSSE(
        s.base,
        (event, data) =>
          event === "library-changed" && (JSON.parse(data) as { path: string }).path === "Podcasts",
      );
      await sse.connected;
      await Bun.write(join(s.roots.libraries, "Podcasts/b.wav"), "x");
      await fetch(`${s.base}/api/rescan`, { method: "POST" });
      await sse.until;
    } finally {
      await s.cleanup();
    }
  });

  test("delivers peaks-ready with the file path when a decode finishes", async () => {
    const s = await makeStack({});
    try {
      await writeWav(join(s.roots.libraries, "Podcasts/tone.wav"), 1);
      await s.rescan("Podcasts");
      const sse = await readSSE(
        s.base,
        (event, data) =>
          event === "peaks-ready" &&
          (JSON.parse(data) as { path: string }).path === "Podcasts/tone.wav",
      );
      await sse.connected;
      await fetch(`${s.base}/api/peaks?path=Podcasts/tone.wav`);
      await sse.until;
    } finally {
      await s.stopPeaks();
      await s.cleanup();
    }
  });
});
