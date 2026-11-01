import { type FSWatcher, watch } from "node:fs";
import { errFields, log } from "./log";

export interface WatchOpts {
  /** Quiet period after the last filesystem event before `onChange` fires (copies emit bursts). */
  debounceMs?: number;
  /** Safety-net interval: `onChange` also fires this often, for mounts that never deliver events (NFS, SMB). */
  pollMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 3_000;
const DEFAULT_POLL_MS = 15 * 60_000;

/**
 * Call `onChange` (debounced) whenever anything under `root` changes, plus on a
 * slow timer as a fallback. Returns a function that stops both.
 * inotify can't see through some network filesystems, hence the timer.
 */
export function watchLibraries(
  root: string,
  onChange: () => void,
  { debounceMs = DEFAULT_DEBOUNCE_MS, pollMs = DEFAULT_POLL_MS }: WatchOpts = {},
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, debounceMs);
  };

  let watcher: FSWatcher | null = null;
  try {
    watcher = watch(root, { recursive: true }, schedule);
    // Vanished mount, permission change, etc. The poll below still covers us.
    watcher.on("error", (err) => log("warn", "library watcher failed", errFields(err)));
  } catch (err) {
    log("warn", "cannot watch libraries; relying on periodic rescan", errFields(err));
  }

  const poll = setInterval(onChange, pollMs);

  return () => {
    watcher?.close();
    clearInterval(poll);
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
}
