import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { openEvents } from "../lib/events";
import { describeRescan, invalidateForEvent } from "../lib/libraryEvents";
import { useAppDispatch } from "../state/context";

/** SSE -> query invalidation and user feedback: the client never polls for library changes. */
export function useLibraryEvents() {
  const qc = useQueryClient();
  const dispatch = useAppDispatch();
  useEffect(
    () =>
      openEvents((name, data) => {
        invalidateForEvent(qc, name, data.path);
        if (name === "library-changed" || name === "libraries-changed") {
          // Files may be back (or gone for good); give "unplayable" another chance.
          dispatch({ type: "clearDead" });
        } else if (name === "rescan-finished") {
          // Quiet when nothing changed (it also fires on server start); Settings shows the last result.
          const summary = describeRescan(data);
          if (summary !== null) toast.success(`Rescan finished — ${summary}`);
        } else if (name === "rescan-failed") {
          toast.error("Rescan failed — see the server log");
        }
      }),
    [qc, dispatch],
  );
}
