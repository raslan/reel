import type { FileEntry } from "../types/library";
import type { SortKey, SortPref } from "../types/player";

/** Ties (and the name sort itself) go by file name, numerically aware. */
const cmpName = (a: FileEntry, b: FileEntry) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });

/** Sort keys whose value is always known; duration can be missing and is handled apart. */
const NUMERIC: Record<Exclude<SortKey, "name" | "duration">, (f: FileEntry) => number> = {
  modified: (f) => f.mtime,
  size: (f) => f.size,
};

/** Direction a key starts in when first chosen: names A→Z, but newest / biggest / longest first reads better. */
export const FIRST_DIR: Record<SortKey, 1 | -1> = { name: 1, duration: 1, modified: -1, size: -1 };

/** Stable, non-mutating sort of folder rows. Unknown durations always sort last. */
export function sortFiles(files: FileEntry[], sort: SortPref): FileEntry[] {
  if (sort.key === "name") {
    return [...files].sort((a, b) => sort.dir * cmpName(a, b));
  }
  if (sort.key === "duration") {
    const known = files
      .filter((f): f is FileEntry & { duration: number } => f.duration !== null)
      .sort((a, b) => sort.dir * (a.duration - b.duration || cmpName(a, b)));
    const unknown = files.filter((f) => f.duration === null).sort(cmpName);
    return [...known, ...unknown];
  }
  const value = NUMERIC[sort.key];
  return [...files].sort((a, b) => sort.dir * (value(a) - value(b)) || cmpName(a, b));
}
