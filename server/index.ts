import type { Database } from "bun:sqlite";
import { readdir, stat } from "node:fs/promises";
import { basename, dirname, extname, join, relative } from "node:path";
import { Glob } from "bun";
import type { Roots } from "./config";
import {
  type FileRow,
  filesByLibrary,
  filesWithNullDuration,
  replaceLibraryFiles,
  setFileDuration,
} from "./db";

const AUDIO_EXTS: Record<string, true> = {
  ".wav": true,
  ".mp3": true,
  ".ogg": true,
  ".oga": true,
  ".flac": true,
  ".m4a": true,
  ".aac": true,
  ".opus": true,
};

/** Walk one library. library "" = files directly under the libraries root (no recursion). */
export async function walkLibrary(roots: Roots, library: string): Promise<FileRow[]> {
  const rows: FileRow[] = [];
  if (library === "") {
    for (const entry of await readdir(roots.libraries)) {
      if (!(extname(entry) in AUDIO_EXTS)) continue;
      const st = await stat(join(roots.libraries, entry));
      rows.push({
        path: entry,
        library: "",
        folder: "",
        name: entry,
        size: st.size,
        mtime: st.mtimeMs / 1000,
        duration: null,
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
  // Bun 1.3.x: Glob options go on scan(), not the constructor.
  const glob = new Glob("**/*");
  for await (const abs of glob.scan({ cwd: base, absolute: true, onlyFiles: true })) {
    if (!(extname(abs) in AUDIO_EXTS)) continue;
    const st = await stat(abs);
    const rel = relative(roots.libraries, abs);
    rows.push({
      path: rel,
      library,
      folder: dirname(rel),
      name: basename(rel),
      size: st.size,
      mtime: st.mtimeMs / 1000,
      duration: null,
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
  replaceLibraryFiles(db, library, merged);
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

/** Subdirectories of the libraries root, sorted case-insensitively. */
export async function candidateLibraries(roots: Roots): Promise<{ name: string; path: string }[]> {
  const entries = await readdir(roots.libraries, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => ({ name: e.name, path: e.name }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** Probe one file with ffprobe. Returns seconds, or null on any failure. */
export async function probeDuration(absPath: string): Promise<number | null> {
  try {
    const proc = Bun.spawn(
      [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        absPath,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;
    if (code !== 0) return null;
    const d = Number.parseFloat(out.trim());
    return Number.isFinite(d) ? d : null;
  } catch {
    return null;
  }
}

export interface DurationPassResult {
  /** Files that got a duration. */
  count: number;
  /** Libraries containing at least one updated file. */
  libraries: string[];
}

/** Probe every file with NULL duration (bounded concurrency). */
export async function runDurationPass(
  db: Database,
  roots: Roots,
  concurrency = 4,
): Promise<DurationPassResult> {
  const pending = filesWithNullDuration(db);
  let i = 0;
  let count = 0;
  const touched = new Set<string>();
  const worker = async () => {
    while (true) {
      const row = pending[i++];
      if (row === undefined) break;
      const d = await probeDuration(join(roots.libraries, row.path));
      if (d !== null) {
        setFileDuration(db, row.path, d);
        touched.add(row.library);
        count++;
      }
    }
  };
  const n = Math.max(1, Math.min(concurrency, pending.length));
  await Promise.all(Array.from({ length: n }, worker));
  return { count, libraries: [...touched] };
}

/** Walk + apply + duration pass for one library. */
export async function rescanLibrary(
  db: Database,
  roots: Roots,
  library: string,
): Promise<WalkDiff> {
  const walked = await walkLibrary(roots, library);
  const diff = applyWalk(db, library, walked);
  await runDurationPass(db, roots);
  return diff;
}
