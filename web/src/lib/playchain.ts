import type { FileEntry } from "../types/library";

/**
 * Like `stepIn`, but continues around the end of the list (for "repeat queue").
 * Falls back to `current` itself when it is the only playable file, so a
 * one-file queue loops. Null only when nothing is playable or `current` isn't listed.
 */
export function stepWrapping(
  files: FileEntry[],
  current: string,
  dir: 1 | -1,
  dead: Set<string>,
): FileEntry | null {
  const n = files.length;
  const i = files.findIndex((f) => f.path === current);
  if (i === -1) return null;
  for (let step = 1; step <= n; step++) {
    const f = files[(((i + dir * step) % n) + n) % n];
    if (f !== undefined && !dead.has(f.path)) return f;
  }
  return null;
}

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
