import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { json, makeStack, waitForEvent, writeWav, type LibrariesBody, type ListBody } from "./helpers";

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
