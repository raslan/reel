import { Glob } from "bun";
import { readdir, stat } from "node:fs/promises";
import { basename, dirname, extname, join, relative } from "node:path";
import type { Database } from "bun:sqlite";
import type { Roots } from "./config";
import {
  deleteLibraryFiles, deleteStalePeaks, filesByLibrary, upsertFiles, type FileRow,
} from "./db";

export const AUDIO_EXTS: Record<string, true> = {
  ".wav": true, ".mp3": true, ".ogg": true, ".oga": true,
  ".flac": true, ".m4a": true, ".aac": true, ".opus": true,
};

/** Walk one library. library "" = files directly under the libraries root (no recursion). */
export async function walkLibrary(roots: Roots, library: string): Promise<FileRow[]> {
  const rows: FileRow[] = [];
  if (library === "") {
    for (const entry of await readdir(roots.libraries)) {
      if (!(extname(entry) in AUDIO_EXTS)) continue;
      const st = await stat(join(roots.libraries, entry));
      rows.push({
        path: entry, library: "", folder: "", name: entry,
        size: st.size, mtime: st.mtimeMs / 1000, duration: null,
      });
    }
    return rows;
  }
  const base = join(roots.libraries, library);
  try {
    const st = await stat(base);
    if (!st.isDirectory()) return rows;
  } catch {
    return rows; // library dir missing
  }
  // Bun 1.3.x ignores Glob's cwd option — build an absolute pattern, escaping
  // glob metacharacters in the base path (e.g. a folder named "Podcasts [2024]").
  const pattern = base.replace(/[*?\[\]]/g, (m) => `\\${m}`) + "/**/*";
  for await (const abs of new Glob(pattern, { absolute: true, onlyFiles: true }).scan()) {
    if (!(extname(abs) in AUDIO_EXTS)) continue;
    const st = await stat(abs);
    const rel = relative(roots.libraries, abs);
    rows.push({
      path: rel, library, folder: dirname(rel), name: basename(rel),
      size: st.size, mtime: st.mtimeMs / 1000, duration: null,
    });
  }
  return rows;
}

export interface WalkDiff {
  added: number;
  removed: number;
  changed: number;
}

/** Replace the index for `library` with `walked`; keep durations for files whose mtime is unchanged. */
export function applyWalk(db: Database, library: string, walked: FileRow[]): WalkDiff {
  const old = new Map(filesByLibrary(db, library).map((r) => [r.path, r]));
  const merged = walked.map((r) => {
    const prev = old.get(r.path);
    return prev && prev.mtime === r.mtime ? { ...r, duration: prev.duration } : r;
  });
  db.transaction(() => {
    deleteLibraryFiles(db, library);
    upsertFiles(db, merged);
    deleteStalePeaks(db);
  })();
  const walkedPaths = new Set(walked.map((r) => r.path));
  return {
    added: walked.filter((r) => !old.has(r.path)).length,
    removed: [...old.keys()].filter((p) => !walkedPaths.has(p)).length,
    changed: walked.filter((r) => {
      const p = old.get(r.path);
      return !!p && p.mtime !== r.mtime;
    }).length,
  };
}

/** Candidates = subdirectories of the libraries root, plus the root itself (name "Library") when it directly holds audio files. */
export async function candidateLibraries(roots: Roots): Promise<{ name: string; path: string }[]> {
  const entries = await readdir(roots.libraries, { withFileTypes: true });
  const out: { name: string; path: string }[] = [];
  if (entries.some((e) => e.isFile() && extname(e.name) in AUDIO_EXTS)) {
    out.push({ name: "Library", path: "" });
  }
  for (const e of entries) if (e.isDirectory()) out.push({ name: e.name, path: e.name });
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
