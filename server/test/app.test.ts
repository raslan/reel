import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  type FavoritesBody,
  json,
  type LibrariesBody,
  type ListBody,
  makeStack,
  postJson,
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

describe("request guards", () => {
  test("every response carries a request id", async () => {
    const s = await makeStack();
    try {
      const a = (await fetch(`${s.base}/api/health`)).headers.get("x-request-id");
      const b = (await fetch(`${s.base}/api/health`)).headers.get("x-request-id");
      expect(a).toBeTruthy();
      expect(a).not.toBe(b);
    } finally {
      await s.cleanup();
    }
  });

  test("writes without a JSON content type are refused (cross-site simple requests)", async () => {
    const s = await makeStack({ files: { "Podcasts/a.mp3": "x" } });
    try {
      await s.rescan("Podcasts");
      for (const path of ["/api/clear", "/api/rescan"]) {
        const res = await fetch(`${s.base}${path}`, { method: "POST" });
        expect(res.status).toBe(415);
        const form = await fetch(`${s.base}${path}`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: "a=1",
        });
        expect(form.status).toBe(415);
      }
      expect(s.rescanService.status().running).toBe(false);
      const list = await json<ListBody>(await fetch(`${s.base}/api/list?path=Podcasts`));
      expect(list.files.length).toBe(1); // nothing was wiped
    } finally {
      await s.cleanup();
    }
  });

  test("writes from a foreign Origin are refused; same-origin and origin-less pass", async () => {
    const s = await makeStack({ files: { "Podcasts/a.mp3": "x" } });
    try {
      await s.rescan("Podcasts");
      const host = new URL(s.base).host;
      const write = (origin?: string, method = "POST", url = "/api/favorites") =>
        fetch(`${s.base}${url}`, {
          method,
          headers: {
            "content-type": "application/json",
            ...(origin === undefined ? {} : { origin }),
          },
          body: method === "POST" ? JSON.stringify({ path: "Podcasts/a.mp3" }) : undefined,
        });
      expect((await write("https://evil.example")).status).toBe(403);
      expect((await write("null")).status).toBe(403);
      expect((await write("https://evil.example", "DELETE", "/api/favorites?path=x")).status).toBe(
        403,
      );
      expect((await write(`http://${host}`)).status).toBe(200);
      expect((await write()).status).toBe(200);
      // reads are never blocked
      const read = await fetch(`${s.base}/api/favorites`, {
        headers: { origin: "https://evil.example" },
      });
      expect(read.status).toBe(200);
    } finally {
      await s.cleanup();
    }
  });
});

describe("input validation", () => {
  test("bad query parameters get a 400 naming the offending fields", async () => {
    const s = await makeStack({ files: { "Podcasts/a.mp3": "x" } });
    try {
      await s.rescan("Podcasts");
      const bad = await fetch(`${s.base}/api/search?q=a&limit=lots`);
      expect(bad.status).toBe(400);
      const body = (await bad.json()) as { error: string; issues: { field: string; message: string }[] };
      expect(body.error).toBe("invalid request");
      expect(body.issues).toEqual([{ field: "limit", message: expect.any(String) }]);

      // a path is required where one identifies a file
      expect((await fetch(`${s.base}/api/peaks`)).status).toBe(400);
      expect((await fetch(`${s.base}/api/favorites`, { method: "DELETE" })).status).toBe(400);
      // ...but optional where it means "the root"
      expect((await fetch(`${s.base}/api/list`)).status).toBe(200);
    } finally {
      await s.cleanup();
    }
  });

  test("search parameters are trimmed and a blank folder means everywhere", async () => {
    const s = await makeStack({ files: { "Podcasts/a.mp3": "x", "Other/b.mp3": "x" } });
    try {
      await s.rescan("Podcasts");
      await s.rescan("Other");
      const res = await json<SearchBody>(await fetch(`${s.base}/api/search?q=%20mp3%20&folder=%20`));
      expect(res.total).toBe(2);
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
        mtime: expect.any(Number),
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

  test("subfolders come from the index: audio-less folders and dot-folders are not listed", async () => {
    const s = await makeStack({
      files: {
        "Podcasts/a.mp3": "x",
        "Podcasts/Has/deep/b.mp3": "x",
        "Podcasts/notes/readme.txt": "x",
        "Podcasts/.hidden/c.mp3": "x",
      },
    });
    try {
      await s.rescan("Podcasts");
      const body = await json<ListBody>(await fetch(`${s.base}/api/list?path=Podcasts`));
      expect(body.folders).toEqual([{ name: "Has", path: "Podcasts/Has" }]);
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
  test("limit caps the returned files while total stays the full match count", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 5; i++) files[`Podcasts/ep-${i}.mp3`] = "x";
    const s = await makeStack({ files });
    try {
      await s.rescan("Podcasts");
      const capped = await json<SearchBody>(await fetch(`${s.base}/api/search?q=ep&limit=2`));
      expect(capped.files.map((f) => f.name)).toEqual(["ep-0.mp3", "ep-1.mp3"]);
      expect(capped.total).toBe(5);
      const huge = await json<SearchBody>(await fetch(`${s.base}/api/search?q=ep&limit=999999`));
      expect(huge.files.length).toBe(5);
      expect((await fetch(`${s.base}/api/search?q=ep&limit=abc`)).status).toBe(400);
      expect((await fetch(`${s.base}/api/search?q=ep&limit=0`)).status).toBe(400);
    } finally {
      await s.cleanup();
    }
  });

  test("case-insensitive substring, empty q returns all files", async () => {
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
  const favPaths = async (base: string) =>
    (await json<FavoritesBody>(await fetch(`${base}/api/favorites`))).files.map((f) => f.path);

  test("add, list, remove round-trip; 404 for unknown path", async () => {
    const s = await makeStack({ files: { "Podcasts/a.mp3": "x" } });
    try {
      await s.rescan("Podcasts");
      expect((await postJson(s.base, "/api/favorites", { path: "Podcasts/a.mp3" })).status).toBe(
        200,
      );
      expect(await favPaths(s.base)).toEqual(["Podcasts/a.mp3"]);
      const del = await fetch(`${s.base}/api/favorites?path=Podcasts/a.mp3`, { method: "DELETE" });
      expect(del.status).toBe(200);
      expect(await favPaths(s.base)).toEqual([]);
      const bad = await postJson(s.base, "/api/favorites", { path: "Podcasts/ghost.mp3" });
      expect(bad.status).toBe(404);
    } finally {
      await s.cleanup();
    }
  });

  test("favorites come back as full file entries, including duration", async () => {
    const s = await makeStack({});
    try {
      await writeWav(join(s.roots.libraries, "Podcasts/tone.wav"), 2);
      await s.rescan("Podcasts");
      await postJson(s.base, "/api/favorites", { path: "Podcasts/tone.wav" });
      const body = await json<FavoritesBody>(await fetch(`${s.base}/api/favorites`));
      expect(body.files).toEqual([
        {
          name: "tone.wav",
          path: "Podcasts/tone.wav",
          duration: expect.any(Number),
          size: expect.any(Number),
          mtime: expect.any(Number),
        },
      ]);
      expect(body.files[0]?.duration).toBeCloseTo(2, 1);
    } finally {
      await s.cleanup();
    }
  });

  test("a missing, empty or non-string path is a 400, not a lookup", async () => {
    const s = await makeStack({ files: { "Podcasts/a.mp3": "x" } });
    try {
      await s.rescan("Podcasts");
      const cases: [unknown, string][] = [
        [{}, "path"],
        [{ path: "" }, "path"],
        [{ path: 5 }, "path"],
        [null, "(request)"],
      ];
      for (const [body, field] of cases) {
        const res = await postJson(s.base, "/api/favorites", body);
        expect(res.status).toBe(400);
        const json = (await res.json()) as { error: string; issues: { field: string }[] };
        expect(json.error).toBe("invalid request");
        expect(json.issues.map((i) => i.field)).toEqual([field]); // names the field, not a stack trace
      }
      const garbage = await fetch(`${s.base}/api/favorites`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      });
      expect(garbage.status).toBe(400);
    } finally {
      await s.cleanup();
    }
  });

  test("adding the same favorite twice is idempotent", async () => {
    const s = await makeStack({ files: { "Podcasts/a.mp3": "x" } });
    try {
      await s.rescan("Podcasts");
      for (let i = 0; i < 2; i++) {
        expect((await postJson(s.base, "/api/favorites", { path: "Podcasts/a.mp3" })).status).toBe(
          200,
        );
      }
      expect(await favPaths(s.base)).toEqual(["Podcasts/a.mp3"]);
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
      const res = await postJson(s.base, "/api/rescan");
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

  test("a second rescan while one runs is a 409, and the outcome is queryable", async () => {
    const s = await makeStack({ files: { "Podcasts/a.wav": "x" } });
    try {
      const done = waitForEvent(s, null, "rescan-finished");
      expect((await postJson(s.base, "/api/rescan")).status).toBe(202);
      const again = await postJson(s.base, "/api/rescan");
      expect(again.status).toBe(409);
      expect(await again.json()).toEqual({ error: "a rescan is already running" });
      await done;

      const status = await json<{ running: boolean; last: { ok: boolean; added: number } | null }>(
        await fetch(`${s.base}/api/rescan`),
      );
      expect(status.running).toBe(false);
      expect(status.last).toMatchObject({ ok: true, added: 1 });
      expect((await postJson(s.base, "/api/rescan")).status).toBe(202); // free again
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
      await postJson(s.base, "/api/favorites", { path: "Podcasts/a.wav" });
      const favs = async () =>
        (await json<FavoritesBody>(await fetch(`${s.base}/api/favorites`))).files;
      expect((await favs()).length).toBe(1);

      const sse = await readSSE(s.base, (event) => event === "libraries-changed");
      await sse.connected;
      const res = await postJson(s.base, "/api/clear");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      await sse.until;

      // Podcasts still exists on disk, so it's listable, but nothing in it is indexed.
      expect(await json<ListBody>(await fetch(`${s.base}/api/list?path=Podcasts`))).toEqual({
        folders: [],
        files: [],
      });
      expect(await favs()).toEqual([]);

      const changed = waitForEvent(s, "Podcasts", "library-changed");
      await postJson(s.base, "/api/rescan");
      await changed;
      const rebuilt = await json<ListBody>(await fetch(`${s.base}/api/list?path=Podcasts`));
      expect(rebuilt.files.map((f) => f.path)).toEqual(["Podcasts/a.wav"]);
    } finally {
      await s.cleanup();
    }
  });

  test("refuses with 409 while a rescan is running, leaving the index intact", async () => {
    const s = await makeStack({ files: { "Podcasts/a.wav": "x" } });
    try {
      await s.rescan("Podcasts");
      expect(s.rescanService.start()).toBe(true);
      const res = await postJson(s.base, "/api/clear");
      expect(res.status).toBe(409);
      await s.rescanService.whenIdle();
      const list = await json<ListBody>(await fetch(`${s.base}/api/list?path=Podcasts`));
      expect(list.files.length).toBe(1);
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
      await postJson(s.base, "/api/rescan");
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
