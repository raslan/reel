import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { upsertFiles } from "../db";
import { RescanService } from "../rescan";
import { makeStackLite, writeWav } from "./helpers";

function record(s: { bus: { subscribe: (w: (e: string, d?: unknown) => void) => () => void } }) {
  const seen: { event: string; data: unknown }[] = [];
  s.bus.subscribe((event, data) => seen.push({ event, data }));
  return seen;
}

describe("RescanService", () => {
  test("indexes every library plus root files, fills durations, and reports totals", async () => {
    const s = await makeStackLite({ files: { "loose.mp3": "x", "Pod/b.mp3": "x" } });
    try {
      await writeWav(join(s.roots.libraries, "Pod/a.wav"), 1);
      const seen = record(s);
      const svc = new RescanService(s.db, s.roots, s.bus);

      expect(svc.status()).toEqual({ running: false, last: null });
      expect(svc.start()).toBe(true);
      expect(svc.status().running).toBe(true);
      await svc.whenIdle();

      const status = svc.status();
      expect(status.running).toBe(false);
      expect(status.last).toMatchObject({ ok: true, added: 3, removed: 0, changed: 0 });
      expect(seen.map((e) => e.event)).toContain("rescan-finished");
      expect(seen).toContainEqual({ event: "library-changed", data: { path: "Pod" } });
      expect(seen).toContainEqual({ event: "library-changed", data: { path: "" } });
      const dur = s.db.query("SELECT duration FROM files WHERE path = 'Pod/a.wav'").get() as {
        duration: number;
      };
      expect(dur.duration).toBeCloseTo(1, 1);
    } finally {
      await s.cleanup();
    }
  });

  test("request() runs once when idle, and queues exactly one follow-up when busy", async () => {
    const s = await makeStackLite({ files: { "Pod/a.mp3": "x" } });
    try {
      const seen = record(s);
      const finished = () => seen.filter((e) => e.event === "rescan-finished").length;
      const svc = new RescanService(s.db, s.roots, s.bus);

      svc.request();
      await svc.whenIdle();
      expect(finished()).toBe(1);

      svc.request();
      svc.request(); // many requests while busy collapse into one more run
      svc.request();
      await svc.whenIdle();
      expect(finished()).toBe(3);

      // The follow-up sees changes made after the first run started.
      await Bun.write(join(s.roots.libraries, "Pod/new.mp3"), "x");
      svc.request();
      await svc.whenIdle();
      const n = s.db.query("SELECT COUNT(*) AS n FROM files WHERE library = 'Pod'").get() as {
        n: number;
      };
      expect(n.n).toBe(2);
    } finally {
      await s.cleanup();
    }
  });

  test("refuses to start while a run is in progress", async () => {
    const s = await makeStackLite({ files: { "Pod/a.mp3": "x" } });
    try {
      const svc = new RescanService(s.db, s.roots, s.bus);
      expect(svc.start()).toBe(true);
      expect(svc.start()).toBe(false);
      await svc.whenIdle();
      expect(svc.start()).toBe(true); // free again afterwards
      await svc.whenIdle();
    } finally {
      await s.cleanup();
    }
  });

  test("removes rows for a library whose folder is gone from disk", async () => {
    const s = await makeStackLite({ files: { "Pod/a.mp3": "x" } });
    try {
      upsertFiles(s.db, [
        {
          path: "Gone/old.mp3",
          library: "Gone",
          folder: "Gone",
          name: "old.mp3",
          size: 1,
          mtime: 1,
          duration: 1,
        },
      ]);
      const svc = new RescanService(s.db, s.roots, s.bus);
      svc.start();
      await svc.whenIdle();
      expect(svc.status().last).toMatchObject({ ok: true, added: 1, removed: 1 });
      const left = s.db.query("SELECT path FROM files ORDER BY path").all();
      expect(left).toEqual([{ path: "Pod/a.mp3" }]);
    } finally {
      await s.cleanup();
    }
  });

  test("a failing run is recorded and announced, never thrown, and does not wedge the service", async () => {
    const s = await makeStackLite({});
    try {
      const seen = record(s);
      const svc = new RescanService(
        s.db,
        { libraries: join(s.roots.data, "does-not-exist"), data: s.roots.data },
        s.bus,
      );
      svc.start();
      await svc.whenIdle();
      expect(svc.status().last).toMatchObject({ ok: false });
      expect(seen.map((e) => e.event)).toContain("rescan-failed");
      expect(svc.start()).toBe(true);
      await svc.whenIdle();
    } finally {
      await s.cleanup();
    }
  });
});
