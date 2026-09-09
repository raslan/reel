import { type FSWatcher, statSync, watch } from "node:fs";
import { join } from "node:path";
import type { Roots } from "./config";
import type { EventBus } from "./events";
import { candidateLibraries, type WalkDiff } from "./index";

export interface WatchCtx {
  roots: Roots;
  bus: EventBus;
  /** Walk + duration pass for one library (no event emission). */
  rescan: (library: string) => Promise<WalkDiff>;
}

export interface WatcherHandle {
  /** Close all watchers and pending debounce timers. */
  stop(): void;
}

/**
 * One recursive watcher per library (debounced rescan of that library) plus
 * one non-recursive watcher on the libraries root. The root watcher keeps the
 * set aligned with the directories actually present: new top-level folders are
 * indexed and watched, removed ones drop their watcher. Registration failures
 * log a warning; recovery is the startup scan and the manual rescan endpoint.
 */
export function startWatchers(ctx: WatchCtx): WatcherHandle {
  const { roots, bus, rescan } = ctx;
  const libWatchers = new Map<string, FSWatcher>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function schedule(key: string, fn: () => void, ms = 700): void {
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        void fn();
      }, ms),
    );
  }

  function watchLibrary(lib: string): void {
    if (libWatchers.has(lib)) return;
    const target = join(roots.libraries, lib);
    try {
      if (!statSync(target).isDirectory()) throw new Error("not a directory");
      const w = watch(target, { recursive: true }, () => {
        schedule(`lib:${lib}`, async () => {
          const d = await rescan(lib);
          if (d.added + d.removed + d.changed > 0) bus.emit("library-changed", { path: lib });
        });
      });
      libWatchers.set(lib, w);
    } catch (err) {
      console.warn(`reel: watch failed for ${target}:`, err);
    }
  }

  /** Align per-library watchers with the directories present under the root. */
  function resync(): void {
    void (async () => {
      const present = new Set((await candidateLibraries(roots)).map((l) => l.path));
      for (const [lib, w] of libWatchers) {
        if (!present.has(lib)) {
          w.close();
          libWatchers.delete(lib);
        }
      }
      for (const lib of present) {
        if (lib === "") continue; // root-as-library is covered by the root watcher
        const isNew = !libWatchers.has(lib);
        watchLibrary(lib);
        if (isNew) {
          // Index the folder's contents now that it is part of the library set.
          const d = await rescan(lib);
          if (d.added + d.removed + d.changed > 0) bus.emit("library-changed", { path: lib });
        }
      }
    })();
  }

  resync();

  let rootWatcher: FSWatcher | null = null;
  try {
    rootWatcher = watch(roots.libraries, { recursive: false }, () => {
      schedule("root", () => {
        resync();
        bus.emit("libraries-changed");
      });
    });
  } catch (err) {
    console.warn(`reel: watch failed for ${roots.libraries}:`, err);
  }

  return {
    stop() {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      for (const w of libWatchers.values()) w.close();
      libWatchers.clear();
      rootWatcher?.close();
    },
  };
}
