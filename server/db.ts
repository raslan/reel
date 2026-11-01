import { Database } from "bun:sqlite";

export interface FileRow {
  /** Path relative to the libraries root, e.g. "Podcasts/Comedians/ep-12.mp3". */
  path: string;
  /** Library folder name; "" = files directly under the libraries root. */
  library: string;
  /** Parent folder path (library name for top-level files, "" for root files). */
  folder: string;
  name: string;
  size: number;
  /** File mtime in seconds (float). */
  mtime: number;
  duration: number | null;
}

/** Column list shared by every query that returns a FileRow. */
const COLS = "path, library, folder, name, size, mtime, duration";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS files (
  path     TEXT PRIMARY KEY,
  library  TEXT NOT NULL,
  folder   TEXT NOT NULL,
  name     TEXT NOT NULL,
  size     INTEGER NOT NULL,
  mtime    REAL NOT NULL,
  duration REAL
);
CREATE INDEX IF NOT EXISTS idx_files_folder  ON files(folder);
CREATE INDEX IF NOT EXISTS idx_files_library ON files(library);
CREATE TABLE IF NOT EXISTS favorites (
  path     TEXT PRIMARY KEY,
  added_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS peaks (
  path    TEXT PRIMARY KEY,
  mtime   REAL NOT NULL,
  buckets INTEGER NOT NULL,
  data    BLOB NOT NULL
);
`;

export function openDb(path: string): Database {
  const db = new Database(path, { create: true });
  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA foreign_keys = ON;");
  db.run(SCHEMA);
  return db;
}

/* ---------- files ---------- */

export function upsertFiles(db: Database, rows: FileRow[]): void {
  const ins = db.prepare(`INSERT OR REPLACE INTO files (${COLS}) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  db.transaction((all: FileRow[]) => {
    for (const r of all) ins.run(r.path, r.library, r.folder, r.name, r.size, r.mtime, r.duration);
  })(rows);
}

export function deleteLibraryFiles(db: Database, library: string): void {
  db.prepare("DELETE FROM files WHERE library = ?").run(library);
}

/**
 * Atomically replace the index for `library` with `merged`.
 * Favorites survive re-indexing; they are dropped only for files that no longer exist.
 */
export function replaceLibraryFiles(db: Database, library: string, merged: FileRow[]): void {
  const next = new Set(merged.map((r) => r.path));
  const removed = filesByLibrary(db, library)
    .map((r) => r.path)
    .filter((p) => !next.has(p));
  db.transaction(() => {
    deleteLibraryFiles(db, library);
    upsertFiles(db, merged);
    deleteStalePeaks(db);
    if (removed.length > 0) {
      const del = db.prepare("DELETE FROM favorites WHERE path = ?");
      for (const p of removed) del.run(p);
    }
  })();
}

export function filesByLibrary(db: Database, library: string): FileRow[] {
  return db
    .query(`SELECT ${COLS} FROM files WHERE library = ?`)
    .all(library) as FileRow[];
}

export function folderFiles(db: Database, folder: string): FileRow[] {
  return db
    .query(`SELECT ${COLS} FROM files WHERE folder = ? ORDER BY name COLLATE NOCASE`)
    .all(folder) as FileRow[];
}

export function countFilesByLibrary(db: Database, library: string): number {
  return (
    db.query("SELECT COUNT(*) AS n FROM files WHERE library = ?").get(library) as { n: number }
  ).n;
}

export function getFile(
  db: Database,
  path: string,
): { mtime: number; duration: number | null } | null {
  const row = db.query("SELECT mtime, duration FROM files WHERE path = ?").get(path) as
    | { mtime: number; duration: number | null }
    | undefined;
  return row ?? null;
}

/** Distinct library names present in the index ("" = root-level files). */
export function indexedLibraries(db: Database): string[] {
  return (db.query("SELECT DISTINCT library FROM files").all() as { library: string }[]).map(
    (r) => r.library,
  );
}

/**
 * Immediate subfolders of `parent` that contain audio at any depth, sorted
 * case-insensitively. `parent` must be a non-empty folder path.
 */
export function childFolders(db: Database, parent: string): { name: string; path: string }[] {
  const rows = db
    .query("SELECT DISTINCT folder FROM files WHERE folder LIKE ? ESCAPE '\\'")
    .all(`${escapeLike(parent)}/%`) as { folder: string }[];
  const names = new Set<string>();
  for (const { folder } of rows) {
    const name = folder.slice(parent.length + 1).split("/")[0];
    if (name) names.add(name);
  }
  return [...names]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map((name) => ({ name, path: `${parent}/${name}` }));
}

/** Indexed files that still have no duration, optionally limited to one library. */
export function filesWithNullDuration(
  db: Database,
  library?: string,
): { path: string; library: string }[] {
  const sql = "SELECT path, library FROM files WHERE duration IS NULL";
  return (
    library === undefined
      ? db.query(sql).all()
      : db.query(`${sql} AND library = ?`).all(library)
  ) as { path: string; library: string }[];
}

/** Record a file's length in seconds. */
export function setFileDuration(db: Database, path: string, duration: number): void {
  db.prepare("UPDATE files SET duration = ? WHERE path = ?").run(duration, path);
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

function searchWhere(q: string, folder?: string): { where: string; params: string[] } {
  const params: string[] = [];
  const where: string[] = [];
  if (q) {
    where.push("name LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLike(q)}%`);
  }
  if (folder) {
    where.push("(folder = ? OR folder LIKE ? ESCAPE '\\')");
    params.push(folder, `${escapeLike(folder)}/%`);
  }
  return { where: where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "", params };
}

/**
 * Case-insensitive filename substring search, best `limit` matches by name.
 * `q` wildcards are escaped. Optional `folder` restricts matches to that
 * folder and its subtrees (folder paths are relative to the library root).
 */
export function searchFiles(db: Database, q: string, folder?: string, limit = -1): FileRow[] {
  const { where, params } = searchWhere(q, folder);
  return db
    .query(
      `SELECT ${COLS} FROM files${where} ORDER BY name COLLATE NOCASE LIMIT ?`,
    )
    .all(...params, limit) as FileRow[];
}

/** Total matches for the same filters as `searchFiles`, ignoring any limit. */
export function countSearch(db: Database, q: string, folder?: string): number {
  const { where, params } = searchWhere(q, folder);
  return (db.query(`SELECT COUNT(*) AS n FROM files${where}`).get(...params) as { n: number }).n;
}

/* ---------- favorites ---------- */

/** Favorited files, by path. Favorites for deleted files are dropped by replaceLibraryFiles on rescan. */
export function favoriteFiles(db: Database): FileRow[] {
  return db
    .query(
      `SELECT x.path, x.library, x.folder, x.name, x.size, x.mtime, x.duration
       FROM favorites f JOIN files x ON x.path = f.path ORDER BY f.path`,
    )
    .all() as FileRow[];
}

export function addFavorite(db: Database, path: string): void {
  db.prepare("INSERT OR IGNORE INTO favorites (path, added_at) VALUES (?, ?)").run(
    path,
    Date.now() / 1000,
  );
}

export function removeFavorite(db: Database, path: string): void {
  db.prepare("DELETE FROM favorites WHERE path = ?").run(path);
}

export function isIndexedFile(db: Database, path: string): boolean {
  return !!db.query("SELECT 1 FROM files WHERE path = ?").get(path);
}

/* ---------- peaks ---------- */

export function getPeaks(db: Database, path: string): { mtime: number; data: Uint8Array } | null {
  const row = db.query("SELECT mtime, data FROM peaks WHERE path = ?").get(path) as
    | { mtime: number; data: Uint8Array }
    | undefined;
  return row ?? null;
}

export function setPeaks(db: Database, path: string, mtime: number, data: Uint8Array): void {
  db.prepare("INSERT OR REPLACE INTO peaks (path, mtime, buckets, data) VALUES (?, ?, ?, ?)").run(
    path,
    mtime,
    data.length / 4,
    data,
  );
}

/** Drop peaks whose file mtime no longer matches (or whose file is gone). */
export function deleteStalePeaks(db: Database): void {
  db.run(`
    DELETE FROM peaks WHERE NOT EXISTS (
      SELECT 1 FROM files f WHERE f.path = peaks.path AND f.mtime = peaks.mtime
    )
  `);
}

/**
 * Wipe all indexed data — files, favorites, peaks — as if the library never
 * existed. The DB file itself stays on disk; a rescan rebuilds the index.
 */
export function clearDb(db: Database): void {
  db.transaction(() => {
    db.run("DELETE FROM files");
    db.run("DELETE FROM favorites");
    db.run("DELETE FROM peaks");
  })();
}
