import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, replaceLibraryFiles, searchFiles } from "../server/db";

let dir: string;
let db: ReturnType<typeof openDb>;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "reel-search-"));
  db = openDb(join(dir, "test.db"));
  // Paths are relative to the libraries root, so they start with the library name.
  replaceLibraryFiles(db, "pod", [
    {
      path: "pod/podcasts/tech/a.mp3",
      library: "pod",
      folder: "pod/podcasts/tech",
      name: "a.mp3",
      size: 1000,
      mtime: 1,
      duration: 12,
    },
    {
      path: "pod/podcasts/tech/b.mp3",
      library: "pod",
      folder: "pod/podcasts/tech",
      name: "b.mp3",
      size: 1000,
      mtime: 1,
      duration: 13,
    },
    {
      path: "pod/podcasts/c.mp3",
      library: "pod",
      folder: "pod/podcasts",
      name: "c.mp3",
      size: 1000,
      mtime: 1,
      duration: 14,
    },
  ]);
});

afterAll(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe("searchFiles", () => {
  it("returns all matches with no scope", () => {
    expect(searchFiles(db, "mp3", ["pod"], undefined).map((r) => r.name)).toEqual([
      "a.mp3",
      "b.mp3",
      "c.mp3",
    ]);
  });

  it("restricts matches to the scoped folder tree", () => {
    const rows = searchFiles(db, "mp3", ["pod"], "pod/podcasts/tech");
    expect(rows.map((r) => r.name)).toEqual(["a.mp3", "b.mp3"]);
  });

  it("matches the scope itself and its subtrees", () => {
    const rows = searchFiles(db, "mp3", ["pod"], "pod/podcasts");
    expect(rows.map((r) => r.name)).toEqual(["a.mp3", "b.mp3", "c.mp3"]);
  });

  it("returns nothing when the scope has no matches", () => {
    expect(searchFiles(db, "mp3", ["pod"], "pod/asmr")).toEqual([]);
  });
});
