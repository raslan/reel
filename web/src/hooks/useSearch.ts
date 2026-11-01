import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { searchFiles } from "../lib/api";
import { searchKey } from "../lib/keys";

/**
 * Filename search. `q` should already be debounced by the caller; an empty
 * query doesn't hit the network (browsing is the Library screen's job).
 * `folder` scopes results. The previous results stay put while a new query loads.
 */
export function useSearch(q: string, folder?: string) {
  const query = q.trim();
  return useQuery({
    queryKey: searchKey(query, folder ?? null),
    queryFn: ({ signal }) => searchFiles(query, folder, signal),
    enabled: query !== "",
    placeholderData: keepPreviousData,
  });
}
