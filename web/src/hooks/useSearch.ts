import { useQuery } from "@tanstack/react-query";
import { searchFiles } from "../lib/api";
import { searchKey } from "../lib/keys";
import { useDebouncedValue } from "./useDebouncedValue";

/** Debounced (250ms) search; `folder` scopes results (Library screen). */
export function useSearch(q: string, folder?: string) {
  const dq = useDebouncedValue(q, 250);
  return useQuery({
    queryKey: searchKey(dq, folder ?? null),
    queryFn: () => searchFiles(dq, folder),
    // Global search (no folder) lists all files on an empty query, like the mockup;
    // in-folder search is only used while a query is typed.
    enabled: folder === undefined ? true : dq.trim() !== "",
  });
}
