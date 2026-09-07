import { statSync, watch, type FSWatcher } from "node:fs";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import type { Roots } from "./config";
import type { EventBus } from "./events";
import { getEnabledLibraries } from "./db";
import type { WalkDiff } from "./index";

export interface WatchCtx {
  db: Database;
  roots: Roots;
  bus: EventBus;
  /** Walk + duration pass for one library (no event emission). */
  rescan: (library: string) => Promise<WalkDiff>;
}

export interface WatcherHandle {
  /** Close all watchers and pending debounce timers. */
  stop(): void;
  /** Align per-library watchers with the currently enabled libraries. */
  resync(): void;
}

/**
 * One recursive watcher per enabled library (debounced rescan of that
 * library) plus one non-recursive watcher on the libraries root
 * (new/removed top-level folders → `libraries-changed`).
 * Registration failures log a warning; recovery is the startup scan and
 * the manual rescan endpoint.
 */
export function startWatchers(ctx: WatchCtx): WatcherHandle {
  const { db, roots, bus, rescan } = ctx;
  const libWatchers = new Map<string, FSWatcher>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function schedule(key: string, fn: () => void, ms = 700): void {
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);
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

  function resync(): void {
    const enabled = new Set(getEnabledLibraries(db));
    for (const [lib, w] of libWatchers) {
      if (!enabled.has(lib)) {
        w.close();
        libWatchers.delete(lib);
      }
    }
    for (const lib of enabled) watchLibrary(lib);
  }

  resync();

  let rootWatcher: FSWatcher | null = null;
  try {
    rootWatcher = watch(roots.libraries, { recursive: false }, () => {
      schedule("root", () => bus.emit("libraries-changed"));
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
    resync,
  };
}
