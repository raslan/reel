import type { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addFavorite,
  deleteLibraryFiles,
  deleteStalePeaks,
  childFolders,
  countSearch,
  type FileRow,
  favoriteFiles,
  filesByLibrary,
  filesWithNullDuration,
  folderFiles,
  getPeaks,
  indexedLibraries,
  openDb,
  removeFavorite,
  replaceLibraryFiles,
  searchFiles,
  setPeaks,
  upsertFiles,
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
  test("creates files, favorites, peaks", async () => {
    const { db, cleanup } = await tempDb();
    try {
      const tables = (
        db.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
      )
        .map((r) => r.name)
        .sort();
      expect(tables).toEqual(expect.arrayContaining(["files", "favorites", "peaks"]));
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

  test("searchFiles is case-insensitive, escapes wildcards, empty q returns all", async () => {
    const { db, cleanup } = await tempDb();
    try {
      upsertFiles(db, [
        row({ path: "Podcasts/Ep-12.mp3", name: "Ep-12.mp3" }),
        row({ path: "Podcasts/100% sure.mp3", name: "100% sure.mp3" }),
        row({ path: "Podcasts/100 sure.mp3", name: "100 sure.mp3" }),
      ]);
      expect(searchFiles(db, "ep-12").map((r) => r.name)).toEqual(["Ep-12.mp3"]);
      expect(searchFiles(db, "100% sure").map((r) => r.name)).toEqual([
        "100% sure.mp3",
      ]);
      expect(searchFiles(db, "100%").map((r) => r.name)).toEqual(["100% sure.mp3"]); // % escaped: literal, not wildcard
      expect(searchFiles(db, "").length).toBe(3);
    } finally {
      await cleanup();
    }
  });

  test("searchFiles honours limit while countSearch reports the full total", async () => {
    const { db, cleanup } = await tempDb();
    try {
      upsertFiles(
        db,
        ["a", "b", "c", "d"].map((n) => row({ path: `Podcasts/${n}.mp3`, name: `${n}.mp3` })),
      );
      expect(searchFiles(db, "mp3", undefined, 2).map((r) => r.name)).toEqual(["a.mp3", "b.mp3"]);
      expect(countSearch(db, "mp3")).toBe(4);
      expect(countSearch(db, "zzz")).toBe(0);
      expect(countSearch(db, "", "Podcasts")).toBe(4);
    } finally {
      await cleanup();
    }
  });

  test("childFolders lists immediate subfolders with audio at any depth, once each", async () => {
    const { db, cleanup } = await tempDb();
    try {
      upsertFiles(db, [
        row({ path: "Pod/a.mp3", folder: "Pod" }),
        row({ path: "Pod/zeta/1.mp3", folder: "Pod/zeta" }),
        row({ path: "Pod/zeta/deep/2.mp3", folder: "Pod/zeta/deep" }),
        row({ path: "Pod/Alpha/3.mp3", folder: "Pod/Alpha" }),
        row({ path: "Pod_x/4.mp3", folder: "Pod_x" }), // `_` must not act as a wildcard
        row({ path: "Podcast/5.mp3", folder: "Podcast" }), // sibling sharing a prefix
      ]);
      expect(childFolders(db, "Pod")).toEqual([
        { name: "Alpha", path: "Pod/Alpha" },
        { name: "zeta", path: "Pod/zeta" },
      ]);
      expect(childFolders(db, "Pod/zeta")).toEqual([{ name: "deep", path: "Pod/zeta/deep" }]);
      expect(childFolders(db, "Pod/Alpha")).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  test("indexedLibraries and filesWithNullDuration(library)", async () => {
    const { db, cleanup } = await tempDb();
    try {
      upsertFiles(db, [
        row({ path: "A/1.mp3", library: "A", folder: "A", duration: null }),
        row({ path: "B/2.mp3", library: "B", folder: "B", duration: null }),
        row({ path: "B/3.mp3", library: "B", folder: "B", duration: 5 }),
        row({ path: "root.mp3", library: "", folder: "", duration: 5 }),
      ]);
      expect(indexedLibraries(db).sort()).toEqual(["", "A", "B"]);
      expect(filesWithNullDuration(db).map((r) => r.path).sort()).toEqual(["A/1.mp3", "B/2.mp3"]);
      expect(filesWithNullDuration(db, "B").map((r) => r.path)).toEqual(["B/2.mp3"]);
    } finally {
      await cleanup();
    }
  });

  test("deleteLibraryFiles removes only that library's files", async () => {
    const { db, cleanup } = await tempDb();
    try {
      upsertFiles(db, [
        row(),
        row({ path: "Other/x.mp3", library: "Other", folder: "Other", name: "x.mp3" }),
      ]);
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
      expect(favoriteFiles(db)).toEqual([row()]);
      removeFavorite(db, "Podcasts/ep-12.mp3");
      removeFavorite(db, "Podcasts/ep-12.mp3");
      expect(favoriteFiles(db)).toEqual([]);
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
      expect(favoriteFiles(db).map((r) => r.path)).toEqual(["Podcasts/ep-12.mp3"]);
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
      expect(favoriteFiles(db).map((r) => r.path)).toEqual(["Podcasts/ep-12.mp3"]);
      expect((db.query("SELECT COUNT(*) AS n FROM favorites").get() as { n: number }).n).toBe(1);
    } finally {
      await cleanup();
    }
  });

  test("favoriteFiles skips favorites whose file is not indexed", async () => {
    const { db, cleanup } = await tempDb();
    try {
      upsertFiles(db, [
        row(),
        row({ path: "Other/x.mp3", library: "Other", folder: "Other", name: "x.mp3" }),
      ]);
      addFavorite(db, "Podcasts/ep-12.mp3");
      addFavorite(db, "Other/x.mp3");
      addFavorite(db, "Ghost/gone.mp3"); // never indexed
      expect(favoriteFiles(db).map((r) => r.path)).toEqual(["Other/x.mp3", "Podcasts/ep-12.mp3"]);
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
      expect(
        Array.from(
          new Float32Array(got!.data.buffer, got!.data.byteOffset, got!.data.byteLength / 4),
        ),
      ).toEqual([2]);
      upsertFiles(db, [row({ mtime: 200 })]); // file changed → peaks stale
      deleteStalePeaks(db);
      expect(getPeaks(db, "Podcasts/ep-12.mp3")).toBeNull();
    } finally {
      await cleanup();
    }
  });
});

