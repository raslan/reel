import { useMemo } from "react";
import { useFavorites } from "./useFavorites";

/** Set of favorited paths, for the star state on list rows. */
export function useFavoritePaths(): Set<string> {
  const { data } = useFavorites();
  return useMemo(() => new Set(data?.files.map((f) => f.path)), [data]);
}
