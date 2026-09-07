import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { json, makeStack, waitForEvent, writeWav, type FavoritesBody, type LibrariesBody, type ListBody, type SearchBody } from "./helpers";

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
  test("lists candidates with enabled flag and file counts", async () => {
    const s = await makeStack({
      files: {
        "Podcasts/a.wav": "x",
        "Field Recordings/b.wav": "x",
        "Field Recordings/Sub/c.wav": "x",
      },
      enabled: ["Podcasts"],
    });
    try {
      await s.rescan("Podcasts");
      const res = await fetch(`${s.base}/api/libraries`);
      expect(res.status).toBe(200);
      const body = await json<LibrariesBody>(res);
      expect(body.libraries).toEqual([
        { name: "Field Recordings", path: "Field Recordings", audioFiles: 0, enabled: false },
        { name: "Podcasts", path: "Podcasts", audioFiles: 1, enabled: true },
      ]);
    } finally {
      await s.cleanup();
    }
  });
});

describe("PUT /api/libraries", () => {
  test("enables a library, discards unknown names, triggers a background rescan", async () => {
    const s = await makeStack({ files: { "Podcasts/a.wav": "x" } });
    try {
      const res = await fetch(`${s.base}/api/libraries`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: ["Podcasts", "Nope"] }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      const body = await json<LibrariesBody>(await fetch(`${s.base}/api/libraries`));
      expect(body.libraries.find((l) => l.path === "Podcasts")).toMatchObject({ enabled: true });
      // await the background rescan's terminal event instead of polling
      await waitForEvent(s, "Podcasts", "library-changed");
      const list = await json<ListBody>(await fetch(`${s.base}/api/list?path=Podcasts`));
      expect(list.files).toEqual([expect.objectContaining({ path: "Podcasts/a.wav" })]);
    } finally {
      await s.cleanup();
    }
  });
});

describe("GET /api/list", () => {
  test("returns folders (live) and files (indexed) for a folder", async () => {
    const s = await makeStack({
      files: {
        "Podcasts/b.mp3": "x",
        "Podcasts/Sub/c.wav": "x",
        "Podcasts/notes.txt": "x",
      },
      enabled: ["Podcasts"],
    });
    try {
      await writeWav(join(s.roots.libraries, "Podcasts/a.wav"), 3000, 440);
      await s.rescan("Podcasts");
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
      expect(root.files).toEqual([]);
    } finally {
      await s.cleanup();
    }
  });

  test("404 for disabled libraries and unknown folders", async () => {
    const s = await makeStack({ files: { "Podcasts/a.wav": "x" }, enabled: [] });
    try {
      expect((await fetch(`${s.base}/api/list?path=Podcasts`)).status).toBe(404);
      expect((await fetch(`${s.base}/api/list?path=Podcasts/Ghost`)).status).toBe(404);
    } finally {
      await s.cleanup();
    }
  });
});

describe("GET /api/search", () => {
  test("case-insensitive substring, unbounded, empty q returns all enabled", async () => {
    const s = await makeStack({
      files: {
        "Podcasts/Ep-12.mp3": "x",
        "Podcasts/ep-13.mp3": "x",
        "Field Recordings/rain.wav": "x",
      },
      enabled: ["Podcasts", "Field Recordings"],
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

  test("excludes files from disabled libraries", async () => {
    const s = await makeStack({
      files: { "Podcasts/a.mp3": "x", "Other/b.mp3": "x" },
      enabled: ["Podcasts"],
    });
    try {
      await s.rescan("Podcasts");
      await s.rescan("Other"); // indexed, but disabled
      const q = await json<SearchBody>(await fetch(`${s.base}/api/search?q=`));
      expect(q.files.map((f) => f.path)).toEqual(["Podcasts/a.mp3"]);
    } finally {
      await s.cleanup();
    }
  });
});

describe("favorites", () => {
  test("add, list, remove round-trip; 404 for unknown path", async () => {
    const s = await makeStack({ files: { "Podcasts/a.mp3": "x" }, enabled: ["Podcasts"] });
    try {
      await s.rescan("Podcasts");
      const add = await fetch(`${s.base}/api/favorites`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: "Podcasts/a.mp3" }),
      });
      expect(add.status).toBe(200);
      expect(await json<FavoritesBody>(await fetch(`${s.base}/api/favorites`))).toEqual({ paths: ["Podcasts/a.mp3"] });
      const del = await fetch(`${s.base}/api/favorites?path=Podcasts/a.mp3`, { method: "DELETE" });
      expect(del.status).toBe(200);
      expect(await json<FavoritesBody>(await fetch(`${s.base}/api/favorites`))).toEqual({ paths: [] });
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
    const s = await makeStack({ files: { "Podcasts/a.mp3": "x" }, enabled: ["Podcasts"] });
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
      expect(await json<FavoritesBody>(await fetch(`${s.base}/api/favorites`))).toEqual({ paths: ["Podcasts/a.mp3"] });
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
