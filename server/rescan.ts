import type { Database } from "bun:sqlite";
import type { Roots } from "./config";
import { indexedLibraries } from "./db";
import type { EventBus } from "./events";
import { applyWalk, candidateLibraries, runDurationPass, walkLibrary } from "./index";
import { errFields, log } from "./log";

interface RescanTotals {
  added: number;
  removed: number;
  changed: number;
}

export type RescanOutcome =
  | ({ ok: true; finishedAt: number } & RescanTotals)
  | { ok: false; finishedAt: number; error: string };

export interface RescanStatus {
  running: boolean;
  /** Result of the most recent run since this process started; null before the first one finishes. */
  last: RescanOutcome | null;
}

/**
 * The single owner of "walk every library, then fill in durations". Startup
 * indexing and the manual rescan both go through here, so runs never overlap
 * and every outcome (including failure) is queryable and announced on the bus.
 */
export class RescanService {
  private job: Promise<void> | null = null;
  private last: RescanOutcome | null = null;
  /** A change arrived mid-run; run once more when this one ends. */
  private again = false;

  constructor(
    private db: Database,
    private roots: Roots,
    private bus: EventBus,
  ) {}

  /** Kick off a run. Returns false (and does nothing) if one is already in progress. */
  start(): boolean {
    if (this.job !== null) return false;
    this.job = this.run().finally(() => {
      this.job = null;
      if (this.again) {
        this.again = false;
        this.start();
      }
    });
    return true;
  }

  /**
   * Ask for an up-to-date index: start a run, or if one is in progress queue exactly one
   * more (what it already walked may predate the change that prompted this).
   */
  request(): void {
    if (!this.start()) this.again = true;
  }

  status(): RescanStatus {
    return { running: this.job !== null, last: this.last };
  }

  /** Resolves when no run is in progress (never rejects: failures are recorded in `status`). */
  async whenIdle(): Promise<void> {
    // A queued follow-up run replaces the job, so keep waiting until there is none.
    while (this.job !== null) await this.job;
  }

  private async run(): Promise<void> {
    const t0 = performance.now();
    try {
      const totals: RescanTotals = { added: 0, removed: 0, changed: 0 };
      // Libraries still in the index but gone from disk must be walked too, so their rows are removed.
      const names = new Set(["", ...indexedLibraries(this.db)]);
      for (const lib of await candidateLibraries(this.roots)) names.add(lib.path);
      for (const lib of names) {
        const diff = applyWalk(this.db, lib, await walkLibrary(this.roots, lib));
        totals.added += diff.added;
        totals.removed += diff.removed;
        totals.changed += diff.changed;
        if (diff.added + diff.removed + diff.changed > 0) {
          this.bus.emit("library-changed", { path: lib });
        }
      }
      for (const lib of (await runDurationPass(this.db, this.roots)).libraries) {
        this.bus.emit("library-changed", { path: lib });
      }
      this.last = { ok: true, finishedAt: Date.now(), ...totals };
      log("info", "rescan finished", { ...totals, ms: Math.round(performance.now() - t0) });
      this.bus.emit("rescan-finished", totals);
    } catch (err) {
      this.last = { ok: false, finishedAt: Date.now(), error: "rescan failed" };
      log("error", "rescan failed", errFields(err));
      this.bus.emit("rescan-failed");
    }
  }
}
