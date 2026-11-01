import type { FavoritesResponse } from "../types/api";
import type { FileEntry } from "../types/library";

/** The favorites list after starring/unstarring `file`; used for the optimistic update. */
export function applyFavoriteToggle(
  prev: FavoritesResponse,
  file: FileEntry,
  add: boolean,
): FavoritesResponse {
  const others = prev.files.filter((f) => f.path !== file.path);
  return { files: add ? [...others, file] : others };
}
