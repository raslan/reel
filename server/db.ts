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
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
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
  const ins = db.prepare(
    "INSERT OR REPLACE INTO files (path, library, folder, name, size, mtime, duration) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
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
    .query("SELECT path, library, folder, name, size, mtime, duration FROM files WHERE library = ?")
    .all(library) as FileRow[];
}

export function folderFiles(db: Database, folder: string): FileRow[] {
  return db
    .query(
      "SELECT path, library, folder, name, size, mtime, duration FROM files WHERE folder = ? ORDER BY name COLLATE NOCASE",
    )
    .all(folder) as FileRow[];
}

export function countFilesByLibrary(db: Database, library: string): number {
  return (db.query("SELECT COUNT(*) AS n FROM files WHERE library = ?").get(library) as { n: number }).n;
}

export function getFile(db: Database, path: string): { mtime: number; duration: number | null } | null {
  const row = db.query("SELECT mtime, duration FROM files WHERE path = ?").get(path) as
    | { mtime: number; duration: number | null }
    | undefined;
  return row ?? null;
}

/** All indexed files that still have no duration. */
export function filesWithNullDuration(db: Database): { path: string; library: string }[] {
  return db
    .query("SELECT path, library FROM files WHERE duration IS NULL")
    .all() as { path: string; library: string }[];
}

/** Set a file's duration in seconds. */
export function setFileDuration(db: Database, path: string, duration: number): void {
  db.prepare("UPDATE files SET duration = ? WHERE path = ?").run(duration, path);
}

/** Case-insensitive filename substring search, unbounded. `q` wildcards are escaped. */
export function searchFiles(db: Database, q: string, enabled: string[]): FileRow[] {
  if (enabled.length === 0) return [];
  const inClause = enabled.map(() => "?").join(", ");
  const params: (string | number)[] = [...enabled];
  let sql = `SELECT path, library, folder, name, size, mtime, duration FROM files WHERE library IN (${inClause})`;
  if (q) {
    sql += ` AND name LIKE ? ESCAPE '\\'`;
    params.push(`%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%`);
  }
  sql += " ORDER BY name COLLATE NOCASE";
  return db.query(sql).all(...params) as FileRow[];
}

export function allFiles(db: Database, enabled: string[]): FileRow[] {
  return searchFiles(db, "", enabled);
}

/* ---------- favorites ---------- */

export function favoritePaths(db: Database, enabled: string[]): string[] {
  if (enabled.length === 0) return [];
  const inClause = enabled.map(() => "?").join(", ");
  return (
    db
      .query(
        `SELECT f.path FROM favorites f JOIN files x ON x.path = f.path WHERE x.library IN (${inClause}) ORDER BY f.path`,
      )
      .all(...enabled) as { path: string }[]
  ).map((r) => r.path);
}

export function addFavorite(db: Database, path: string): void {
  db.prepare("INSERT OR IGNORE INTO favorites (path, added_at) VALUES (?, ?)").run(path, Date.now() / 1000);
}

export function removeFavorite(db: Database, path: string): void {
  db.prepare("DELETE FROM favorites WHERE path = ?").run(path);
}

export function isIndexedFile(db: Database, path: string): boolean {
  return !!db.query("SELECT 1 FROM files WHERE path = ?").get(path);
}

/* ---------- peaks ---------- */

export function getPeaks(db: Database, path: string): { mtime: number; data: Uint8Array } | null {
  const row = db
    .query("SELECT mtime, data FROM peaks WHERE path = ?")
    .get(path) as { mtime: number; data: Uint8Array } | undefined;
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

/* ---------- settings ---------- */

export function getEnabledLibraries(db: Database): string[] {
  const row = db.query("SELECT value FROM settings WHERE key = 'libraries'").get() as
    | { value: string }
    | undefined;
  return row ? (JSON.parse(row.value) as string[]) : [];
}

export function setEnabledLibraries(db: Database, enabled: string[]): void {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('libraries', ?)").run(JSON.stringify(enabled));
}
