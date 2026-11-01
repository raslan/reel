import { useQuery } from "@tanstack/react-query";
import { getPeaks } from "../lib/api";
import { peaksKey } from "../lib/keys";

const POLL_MS = 1200;
/** Give up polling after this many pending answers (~2 min); the SSE `peaks-ready` event can still land later. */
const MAX_POLLS = 100;

/**
 * Polls while the server is computing peaks (202 pending); the SSE
 * `peaks-ready` event (useLibraryEvents) also invalidates this query.
 */
export function usePeaks(path: string | null) {
  return useQuery({
    queryKey: peaksKey(path ?? ""),
    queryFn: ({ signal }) => getPeaks(path as string, signal),
    enabled: path !== null,
    staleTime: 5 * 60_000,
    refetchInterval: (query) =>
      query.state.data?.status === "pending" && query.state.dataUpdateCount < MAX_POLLS
        ? POLL_MS
        : false,
    retry: false,
  });
}
