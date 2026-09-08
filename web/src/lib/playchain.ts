import type { FileEntry } from "../types/library";

/**
 * Next playable file in a sorted folder list: direction ±1, skipping dead
 * (missing/unplayable) paths. Returns null at the end of the chain.
 */
export function stepIn(
  files: FileEntry[],
  current: string,
  dir: 1 | -1,
  dead: Set<string>,
): FileEntry | null {
  const i = files.findIndex((f) => f.path === current);
  if (i === -1) return null;
  for (let step = 1; step < files.length; step++) {
    const j = i + dir * step;
    if (j < 0 || j >= files.length) return null;
    const f = files[j];
    if (f !== undefined && !dead.has(f.path)) return f;
  }
  return null;
}
