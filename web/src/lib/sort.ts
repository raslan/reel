import type { FileEntry } from "../types/library";
import type { SortPref } from "../types/player";

const cmpName = (a: FileEntry, b: FileEntry) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });

/** Stable, non-mutating sort of folder rows. Unknown durations always sort last. */
export function sortFiles(files: FileEntry[], sort: SortPref): FileEntry[] {
  if (sort.key === "name") {
    return [...files].sort((a, b) => sort.dir * cmpName(a, b));
  }
  const known = files
    .filter((f): f is FileEntry & { duration: number } => f.duration !== null)
    .sort((a, b) => sort.dir * (a.duration - b.duration || cmpName(a, b)));
  const unknown = files.filter((f) => f.duration === null).sort(cmpName);
  return [...known, ...unknown];
}
