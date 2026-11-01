import type { QueryClient } from "@tanstack/react-query";
import type { EventName } from "./events";
import { favoritesKey, peaksKey, rescanKey } from "./keys";

/** "3 added, 1 removed", or null when a rescan changed nothing. */
export function describeRescan({
  added = 0,
  removed = 0,
  changed = 0,
}: {
  added?: number;
  removed?: number;
  changed?: number;
}): string | null {
  const parts = [
    added > 0 && `${added} added`,
    removed > 0 && `${removed} removed`,
    changed > 0 && `${changed} changed`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * Server event -> which cached queries are now stale. The client never polls
 * for library changes; the SSE stream is the only trigger.
 */
export function invalidateForEvent(qc: QueryClient, name: EventName, path: string | undefined) {
  const all = () => {
    void qc.invalidateQueries({ queryKey: ["folder"] });
    void qc.invalidateQueries({ queryKey: ["search"] });
    void qc.invalidateQueries({ queryKey: favoritesKey });
  };
  switch (name) {
    case "library-changed":
      void qc.invalidateQueries({
        predicate: (q) => {
          const [kind, key] = q.queryKey;
          if (kind !== "folder") return false;
          // The root lists libraries; otherwise match the library and anything beneath it.
          return (
            path === undefined ||
            key === "" ||
            (typeof key === "string" && (key === path || key.startsWith(`${path}/`)))
          );
        },
      });
      void qc.invalidateQueries({ queryKey: ["search"] });
      // A removed file must drop out of favorites (the server drops it from the table).
      void qc.invalidateQueries({ queryKey: favoritesKey });
      break;
    case "libraries-changed":
      all();
      break;
    case "rescan-finished":
      all();
      void qc.invalidateQueries({ queryKey: rescanKey });
      break;
    case "rescan-failed":
      void qc.invalidateQueries({ queryKey: rescanKey });
      break;
    case "peaks-ready":
    case "peaks-failed":
      if (path) void qc.invalidateQueries({ queryKey: peaksKey(path) });
      break;
  }
}
