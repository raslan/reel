import type { Database } from "bun:sqlite";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { Roots } from "./config";
import { childFolders, countSearch, type FileRow, folderFiles, searchFiles } from "./db";
import { NotFoundError } from "./errors";
import { candidateLibraries } from "./index";

export interface FileEntry {
  name: string;
  path: string;
  duration: number | null;
  size: number;
  /** File mtime, seconds since the epoch. */
  mtime: number;
}

export interface FolderListing {
  folders: { name: string; path: string }[];
  files: FileEntry[];
}

export const toFileEntry = (r: FileRow): FileEntry => ({
  name: r.name,
  path: r.path,
  duration: r.duration,
  size: r.size,
  mtime: r.mtime,
});

/** Filename search: up to `limit` matches plus the true match count. */
export function searchLibrary(
  db: Database,
  { q, folder, limit }: { q: string; folder: string | undefined; limit: number },
): { files: FileEntry[]; total: number } {
  return {
    files: searchFiles(db, q, folder, limit).map(toFileEntry),
    total: countSearch(db, q, folder),
  };
}

/** A folder is browsable if it's the root or an existing directory under the libraries root. */
async function isKnownFolder(roots: Roots, p: string): Promise<boolean> {
  if (p === "") return true;
  // Traversal guard: only plain relative segments under the libraries root.
  if (p.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) return false;
  try {
    return (await stat(join(roots.libraries, p))).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Contents of one folder. Files and subfolders both come from the index, so
 * what you can browse is exactly what can be played; only the root lists the
 * library directories themselves (an empty library should still show up).
 */
export async function listFolder(
  { db, roots }: { db: Database; roots: Roots },
  p: string,
): Promise<FolderListing> {
  if (!(await isKnownFolder(roots, p))) throw new NotFoundError();
  const folders = p === "" ? await candidateLibraries(roots) : childFolders(db, p);
  return { folders, files: folderFiles(db, p).map(toFileEntry) };
}
