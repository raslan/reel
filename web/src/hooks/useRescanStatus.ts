import { useQuery } from "@tanstack/react-query";
import { getRescanStatus } from "../lib/api";
import { rescanKey } from "../lib/keys";

/** Whether a rescan is running and how the last one went. Kept fresh by the SSE rescan events. */
export function useRescanStatus() {
  return useQuery({
    queryKey: rescanKey,
    queryFn: ({ signal }) => getRescanStatus(signal),
  });
}
