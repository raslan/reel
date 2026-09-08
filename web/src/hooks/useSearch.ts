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
    enabled: dq.trim() !== "",
  });
}
