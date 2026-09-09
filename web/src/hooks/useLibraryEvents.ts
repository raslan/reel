import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { openEvents } from "../lib/events";
import { peaksKey } from "../lib/keys";

/** SSE -> query invalidation: the client never polls for library changes. */
export function useLibraryEvents() {
  const qc = useQueryClient();
  useEffect(
    () =>
      openEvents((name, data) => {
        const lib = data.path;
        if (name === "library-changed") {
          void qc.invalidateQueries({
            predicate: (q) =>
              q.queryKey[0] === "folder" &&
              (lib === undefined ||
                q.queryKey[1] === "" ||
                (typeof q.queryKey[1] === "string" &&
                  (q.queryKey[1] === lib || q.queryKey[1].startsWith(`${lib}/`)))),
          });
          void qc.invalidateQueries({ queryKey: ["search"] });
        } else if (name === "libraries-changed") {
          void qc.invalidateQueries({ queryKey: ["folder"] });
          void qc.invalidateQueries({ queryKey: ["search"] });
        } else if (name === "peaks-ready" || name === "peaks-failed") {
          if (lib) void qc.invalidateQueries({ queryKey: peaksKey(lib) });
        }
      }),
    [qc],
  );
}
