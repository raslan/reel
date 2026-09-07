import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import {
  addFavorite, deleteLibraryFiles, deleteStalePeaks, favoritePaths, filesByLibrary,
  folderFiles, getEnabledLibraries, getPeaks, openDb, removeFavorite,
  replaceLibraryFiles, searchFiles, setEnabledLibraries, setPeaks, upsertFiles, type FileRow,
} from "../db";

async function tempDb(): Promise<{ db: Database; cleanup: () => Promise<void> }> {
  const tmp = await mkdtemp(join(tmpdir(), "reel-db-"));
  const db = openDb(join(tmp, "reel.db"));
  return {
    db,
    cleanup: async () => {
      db.close();
      await rm(tmp, { recursive: true, force: true });
    },
  };
}

const row = (over: Partial<FileRow> = {}): FileRow => ({
  path: "Podcasts/ep-12.mp3",
  library: "Podcasts",
  folder: "Podcasts",
  name: "ep-12.mp3",
  size: 1000,
  mtime: 1_700_000_000,
  duration: 123.4,
  ...over,
});

describe("db schema", () => {
  test("creates files, favorites, peaks, settings", async () => {
    const { db, cleanup } = await tempDb();
    try {
      const tables = (
        db.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
      )
        .map((r) => r.name)
        .sort();
      expect(tables).toEqual(expect.arrayContaining(["files", "favorites", "peaks", "settings"]));
    } finally {
      await cleanup();
    }
  });
});

describe("files", () => {
  test("upsert + folderFiles round-trip with case-insensitive sort", async () => {
    const { db, cleanup } = await tempDb();
    try {
      upsertFiles(db, [
        row({ path: "Podcasts/b.mp3", name: "b.mp3" }),
        row({ path: "Podcasts/A.mp3", name: "A.mp3" }),
        row({ path: "Podcasts/Sub/c.mp3", folder: "Podcasts/Sub", name: "c.mp3" }),
      ]);
      expect(folderFiles(db, "Podcasts").map((r) => r.name)).toEqual(["A.mp3", "b.mp3"]);
      expect(folderFiles(db, "Podcasts/Sub").map((r) => r.name)).toEqual(["c.mp3"]);
      expect(filesByLibrary(db, "Podcasts").length).toBe(3);
    } finally {
      await cleanup();
    }
  });

  test("searchFiles is case-insensitive, escapes wildcards, empty enabled → []", async () => {
    const { db, cleanup } = await tempDb();
    try {
      upsertFiles(db, [
        row({ path: "Podcasts/Ep-12.mp3", name: "Ep-12.mp3" }),
        row({ path: "Podcasts/100% sure.mp3", name: "100% sure.mp3" }),
        row({ path: "Podcasts/100 sure.mp3", name: "100 sure.mp3" }),
      ]);
      expect(searchFiles(db, "ep-12", ["Podcasts"]).map((r) => r.name)).toEqual(["Ep-12.mp3"]);
      expect(searchFiles(db, "100% sure", ["Podcasts"]).map((r) => r.name)).toEqual(["100% sure.mp3"]);
      expect(searchFiles(db, "100%", ["Podcasts"]).map((r) => r.name)).toEqual(["100% sure.mp3"]); // % escaped: literal, not wildcard
      expect(searchFiles(db, "ep", [])).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  test("deleteLibraryFiles removes only that library's files", async () => {
    const { db, cleanup } = await tempDb();
    try {
      upsertFiles(db, [row(), row({ path: "Other/x.mp3", library: "Other", folder: "Other", name: "x.mp3" })]);
      deleteLibraryFiles(db, "Podcasts");
      expect(filesByLibrary(db, "Podcasts")).toEqual([]);
      expect(filesByLibrary(db, "Other").length).toBe(1);
    } finally {
      await cleanup();
    }
  });
});

describe("favorites", () => {
  test("add is idempotent, remove is idempotent", async () => {
    const { db, cleanup } = await tempDb();
    try {
      upsertFiles(db, [row()]);
      addFavorite(db, "Podcasts/ep-12.mp3");
      addFavorite(db, "Podcasts/ep-12.mp3");
      expect(favoritePaths(db, ["Podcasts"])).toEqual(["Podcasts/ep-12.mp3"]);
      removeFavorite(db, "Podcasts/ep-12.mp3");
      removeFavorite(db, "Podcasts/ep-12.mp3");
      expect(favoritePaths(db, ["Podcasts"])).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  test("replaceLibraryFiles keeps favorites when the file is re-indexed", async () => {
    const { db, cleanup } = await tempDb();
    try {
      upsertFiles(db, [row()]);
      addFavorite(db, "Podcasts/ep-12.mp3");
      replaceLibraryFiles(db, "Podcasts", [row()]);
      expect(favoritePaths(db, ["Podcasts"])).toEqual(["Podcasts/ep-12.mp3"]);
    } finally {
      await cleanup();
    }
  });

  test("replaceLibraryFiles drops favorites only for files that are gone", async () => {
    const { db, cleanup } = await tempDb();
    try {
      upsertFiles(db, [row(), row({ path: "Podcasts/gone.mp3", name: "gone.mp3" })]);
      addFavorite(db, "Podcasts/ep-12.mp3");
      addFavorite(db, "Podcasts/gone.mp3");
      replaceLibraryFiles(db, "Podcasts", [row()]);
      expect(favoritePaths(db, ["Podcasts"])).toEqual(["Podcasts/ep-12.mp3"]);
      expect((db.query("SELECT COUNT(*) AS n FROM favorites").get() as { n: number }).n).toBe(1);
    } finally {
      await cleanup();
    }
  });

  test("favoritePaths filters to enabled libraries", async () => {
    const { db, cleanup } = await tempDb();
    try {
      upsertFiles(db, [row(), row({ path: "Other/x.mp3", library: "Other", folder: "Other", name: "x.mp3" })]);
      addFavorite(db, "Podcasts/ep-12.mp3");
      addFavorite(db, "Other/x.mp3");
      expect(favoritePaths(db, ["Podcasts"])).toEqual(["Podcasts/ep-12.mp3"]);
    } finally {
      await cleanup();
    }
  });
});

describe("peaks", () => {
  test("set/get round-trip; deleteStalePeaks drops mismatched mtimes", async () => {
    const { db, cleanup } = await tempDb();
    try {
      setPeaks(db, "Podcasts/ep-12.mp3", 100, new Uint8Array([0, 0, 0, 64])); // float32 2.0 (0x40000000 LE)
      const got = getPeaks(db, "Podcasts/ep-12.mp3");
      expect(got?.mtime).toBe(100);
      expect(Array.from(new Float32Array(got!.data.buffer, got!.data.byteOffset, got!.data.byteLength / 4))).toEqual([2]);
      upsertFiles(db, [row({ mtime: 200 })]); // file changed → peaks stale
      deleteStalePeaks(db);
      expect(getPeaks(db, "Podcasts/ep-12.mp3")).toBeNull();
    } finally {
      await cleanup();
    }
  });
});

describe("settings", () => {
  test("enabled libraries round-trip", async () => {
    const { db, cleanup } = await tempDb();
    try {
      expect(getEnabledLibraries(db)).toEqual([]);
      setEnabledLibraries(db, ["Podcasts", "Field Recordings"]);
      expect(getEnabledLibraries(db)).toEqual(["Podcasts", "Field Recordings"]);
    } finally {
      await cleanup();
    }
  });
});
