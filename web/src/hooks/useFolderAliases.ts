import { useQuery } from "@tanstack/react-query";
import { getFolderAliases } from "../lib/api";
import { folderAliasesKey } from "../lib/keys";

/**
 * Folder display names. The map changes only through this app's own writes, so
 * mutations invalidate `folderAliasesKey`; the global staleness window re-reads
 * it on later mounts.
 */
export function useFolderAliases() {
  return useQuery({
    queryKey: folderAliasesKey,
    queryFn: ({ signal }) => getFolderAliases(signal),
  });
}
