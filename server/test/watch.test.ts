import { describe, expect, test } from "bun:test";
import { watch } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { rescanLibrary } from "../index";
import { startWatchers } from "../watch";
import { makeStackLite, waitForEvent, writeWav, type StackLite } from "./helpers";

// inotify is required; skip cleanly where it is unavailable.
const canWatch = (() => {
  try {
    const w = watch("/tmp", () => {});
    w.close();
    return true;
  } catch {
    return false;
  }
})();
const it = canWatch ? test : test.skip;

function watchCtx(s: StackLite) {
  return {
    db: s.db,
    roots: s.roots,
    bus: s.bus,
    rescan: (lib: string) => rescanLibrary(s.db, s.roots, lib),
  };
}

describe("watch", () => {
  it("file creation in a watched library updates the index and emits library-changed", async () => {
    const s = await makeStackLite({ files: { "Podcasts/a.wav": "x" }, enabled: ["Podcasts"] });
    const w = startWatchers(watchCtx(s));
    try {
      await rescanLibrary(s.db, s.roots, "Podcasts"); // initial index
      const changed = waitForEvent(s, "Podcasts", "library-changed");
      await writeWav(join(s.roots.libraries, "Podcasts/b.wav"), 1);
      await changed;
      const rows = s.db.query("SELECT path FROM files ORDER BY path").all() as { path: string }[];
      expect(rows.map((r) => r.path)).toEqual(["Podcasts/a.wav", "Podcasts/b.wav"]);
    } finally {
      w.stop();
      await s.cleanup();
    }
  });

  it("file deletion removes it from the index and drops its favorite", async () => {
    const s = await makeStackLite({ files: { "Podcasts/a.wav": "x" }, enabled: ["Podcasts"] });
    const w = startWatchers(watchCtx(s));
    try {
      await rescanLibrary(s.db, s.roots, "Podcasts");
      s.db.prepare("INSERT OR IGNORE INTO favorites (path, added_at) VALUES (?, ?)").run("Podcasts/a.wav", 1);

      const changed = waitForEvent(s, "Podcasts", "library-changed");
      await rm(join(s.roots.libraries, "Podcasts/a.wav"));
      await changed;
      expect((s.db.query("SELECT COUNT(*) AS n FROM files").get() as { n: number }).n).toBe(0);
      expect((s.db.query("SELECT COUNT(*) AS n FROM favorites").get() as { n: number }).n).toBe(0);
    } finally {
      w.stop();
      await s.cleanup();
    }
  });

  it("a new top-level library folder emits libraries-changed", async () => {
    const s = await makeStackLite({ files: { "Podcasts/a.wav": "x" }, enabled: ["Podcasts"] });
    const w = startWatchers(watchCtx(s));
    try {
      const changed = waitForEvent(s, null, "libraries-changed");
      await mkdir(join(s.roots.libraries, "New Library"), { recursive: true });
      await changed;
    } finally {
      w.stop();
      await s.cleanup();
    }
  });
});
