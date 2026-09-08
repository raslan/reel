import { useQuery } from "@tanstack/react-query";
import { getPeaks } from "../lib/api";
import { peaksKey } from "../lib/keys";

/**
 * Polls while the server is computing peaks (202 pending); the SSE
 * `peaks-ready` event (useLibraryEvents) also invalidates this query.
 */
export function usePeaks(path: string | null) {
  return useQuery({
    queryKey: peaksKey(path ?? ""),
    queryFn: () => getPeaks(path as string),
    enabled: path !== null,
    staleTime: 5 * 60_000,
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 1200 : false),
    retry: false,
  });
}
