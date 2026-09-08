import { describe, expect, test } from "bun:test";
import { mkdir, rm, utimes } from "node:fs/promises";
import { join } from "node:path";
import {
  applyWalk,
  candidateLibraries,
  probeDuration,
  rescanLibrary,
  runDurationPass,
  walkLibrary,
} from "../index";
import { makeStackLite, makeTempDir, writeWav } from "./helpers";

describe("walkLibrary", () => {
  test("walks nested folders, filters by extension, sets folder/name", async () => {
    const s = await makeStackLite({
      files: {
        "Podcasts/ep-1.wav": "x",
        "Podcasts/Comedians/ep-2.mp3": "x",
        "Podcasts/notes.txt": "x",
        "Other/readme.md": "x",
      },
    });
    try {
      const rows = await walkLibrary(s.roots, "Podcasts");
      expect(rows.map((r) => r.path).sort()).toEqual([
        "Podcasts/Comedians/ep-2.mp3",
        "Podcasts/ep-1.wav",
      ]);
      const c = rows.find((r) => r.path === "Podcasts/Comedians/ep-2.mp3")!;
      expect(c.folder).toBe("Podcasts/Comedians");
      expect(c.name).toBe("ep-2.mp3");
      expect(c.library).toBe("Podcasts");
      expect(c.duration).toBeNull();
      expect(await walkLibrary(s.roots, "Missing")).toEqual([]);
    } finally {
      await s.cleanup();
    }
  });

  test('root library ("") lists only top-level audio files', async () => {
    const s = await makeStackLite({
      files: {
        "top.wav": "x",
        "top.txt": "x",
        "Sub/nested.wav": "x",
      },
    });
    try {
      const rows = await walkLibrary(s.roots, "");
      expect(rows.map((r) => r.path)).toEqual(["top.wav"]);
      expect(rows[0]!.folder).toBe("");
      expect(rows[0]!.library).toBe("");
    } finally {
      await s.cleanup();
    }
  });
});

describe("applyWalk", () => {
  test("diffs added/changed/removed and keeps duration when mtime is unchanged", async () => {
    const s = await makeStackLite({});
    const p = join(s.roots.libraries, "Podcasts/a.wav");
    try {
      await writeWav(p, 0.5);
      let diff = applyWalk(s.db, "Podcasts", await walkLibrary(s.roots, "Podcasts"));
      expect(diff).toEqual({ added: 1, removed: 0, changed: 0 });

      s.db.prepare("UPDATE files SET duration = 0.5 WHERE path = ?").run("Podcasts/a.wav");
      diff = applyWalk(s.db, "Podcasts", await walkLibrary(s.roots, "Podcasts"));
      expect(diff).toEqual({ added: 0, removed: 0, changed: 0 });
      const kept = s.db.query("SELECT duration FROM files WHERE path = 'Podcasts/a.wav'").get() as {
        duration: number | null;
      };
      expect(kept.duration).toBe(0.5);

      await writeWav(p, 0.7);
      await utimes(p, 1_700_000_900, 1_700_000_900); // force a distinct mtime
      diff = applyWalk(s.db, "Podcasts", await walkLibrary(s.roots, "Podcasts"));
      expect(diff.changed).toBe(1);
      const reset = s.db
        .query("SELECT duration FROM files WHERE path = 'Podcasts/a.wav'")
        .get() as { duration: number | null };
      expect(reset.duration).toBeNull();

      await rm(p);
      diff = applyWalk(s.db, "Podcasts", await walkLibrary(s.roots, "Podcasts"));
      expect(diff.removed).toBe(1);
    } finally {
      await s.cleanup();
    }
  });
});

describe("candidateLibraries", () => {
  test("subdirectories + root when it directly holds audio files", async () => {
    const s = await makeStackLite({
      files: {
        "Podcasts/a.wav": "x",
        "Field Recordings/b.wav": "x",
        "top.wav": "x",
      },
    });
    try {
      expect(await candidateLibraries(s.roots)).toEqual([
        { name: "Field Recordings", path: "Field Recordings" },
        { name: "Library", path: "" },
        { name: "Podcasts", path: "Podcasts" },
      ]);
    } finally {
      await s.cleanup();
    }
  });
});

describe("probeDuration", () => {
  test("returns duration for a valid wav, null for a missing file", async () => {
    const { dir, cleanup } = await makeTempDir("reel-probe-");
    try {
      const p = join(dir, "a.wav");
      await writeWav(p, 1);
      expect(await probeDuration(p)).toBeCloseTo(1, 1);
      expect(await probeDuration(join(dir, "nope.wav"))).toBeNull();
    } finally {
      await cleanup();
    }
  });
});

describe("runDurationPass", () => {
  test("fills NULL durations and is a no-op when nothing is pending", async () => {
    const s = await makeStackLite({});
    try {
      const dir = join(s.roots.libraries, "Podcasts");
      await mkdir(dir, { recursive: true });
      await writeWav(join(dir, "a.wav"), 1);
      await writeWav(join(dir, "b.wav"), 2);
      applyWalk(s.db, "Podcasts", await walkLibrary(s.roots, "Podcasts"));
      expect(await runDurationPass(s.db, s.roots)).toEqual({ count: 2, libraries: ["Podcasts"] });
      const rows = s.db.query("SELECT path, duration FROM files ORDER BY path").all() as {
        path: string;
        duration: number | null;
      }[];
      expect(rows[0]).toEqual({ path: "Podcasts/a.wav", duration: expect.any(Number) });
      expect(rows[1]).toEqual({ path: "Podcasts/b.wav", duration: expect.any(Number) });
      expect(rows[0]!.duration!).toBeCloseTo(1, 1);
      expect(rows[1]!.duration!).toBeCloseTo(2, 1);
      expect(await runDurationPass(s.db, s.roots)).toEqual({ count: 0, libraries: [] });
    } finally {
      await s.cleanup();
    }
  });
});

describe("rescanLibrary", () => {
  test("walks, applies, and probes durations in one call", async () => {
    const s = await makeStackLite({});
    try {
      await writeWav(join(s.roots.libraries, "Podcasts/a.wav"), 1);
      const diff = await rescanLibrary(s.db, s.roots, "Podcasts");
      expect(diff.added).toBe(1);
      const r = s.db.query("SELECT duration FROM files WHERE path = 'Podcasts/a.wav'").get() as {
        duration: number;
      };
      expect(r.duration).toBeCloseTo(1, 1);
    } finally {
      await s.cleanup();
    }
  });
});
