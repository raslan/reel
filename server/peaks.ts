import { join } from "node:path";
import type { Database } from "bun:sqlite";
import type { Roots } from "./config";
import type { EventBus } from "./events";
import { getPeaks, setPeaks } from "./db";

export const PEAK_BUCKETS = 1024;

export type PeaksState = "ready" | "pending" | "failed";

export class PeaksService {
  private queue: string[] = [];
  private running = new Set<string>();
  private failed = new Map<string, number>(); // path -> mtime at failure
  private stopped = false;

  constructor(
    private db: Database,
    private roots: Roots,
    private bus: EventBus,
  ) {}

  /**
   * State for (path, mtime):
   * - "ready": cached peaks exist for this mtime
   * - "failed": decode failed for this mtime (latched until mtime changes)
   * - "pending": everything else (queued, running, or not yet queued)
   */
  getState(path: string, mtime: number): PeaksState {
    const cached = getPeaks(this.db, path);
    if (cached && cached.mtime === mtime) return "ready";
    if (this.failed.get(path) === mtime) return "failed";
    return "pending";
  }

  /** Queue (path, mtime) if pending. Idempotent. */
  ensure(path: string, mtime: number): void {
    if (this.stopped) return;
    if (this.getState(path, mtime) !== "pending") return;
    if (this.queue.includes(path) || this.running.has(path)) return;
    this.queue.push(path);
    void this.pump();
  }

  /** Cached peaks for a path, or null. */
  getCached(path: string): { mtime: number; data: Uint8Array } | null {
    return getPeaks(this.db, path);
  }

  /** Stop accepting work and wait for in-flight jobs. */
  async stop(): Promise<void> {
    this.stopped = true;
    this.queue = [];
    while (this.running.size > 0) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  private async pump(): Promise<void> {
    while (this.queue.length > 0 && this.running.size < 1) {
      const path = this.queue.shift()!;
      const file = this.db
        .query("SELECT mtime FROM files WHERE path = ?")
        .get(path) as { mtime: number } | undefined;
      if (!file) continue; // file disappeared before its turn
      this.running.add(path);
      void this.runJob(path, file.mtime).finally(() => {
        this.running.delete(path);
        void this.pump();
      });
    }
  }

  private async runJob(path: string, mtime: number): Promise<void> {
    try {
      const peaks = await this.decode(path);
      setPeaks(this.db, path, mtime, peaks);
      this.bus.emit("peaks-ready", { path });
    } catch {
      this.failed.set(path, mtime);
      this.bus.emit("peaks-failed", { path });
    }
  }

  /** Decode the file to 1024 normalized peak values (0.08–0.96). Throws on failure. */
  private async decode(path: string): Promise<Uint8Array> {
    const abs = join(this.roots.libraries, path);
    const duration =
      (this.db.query("SELECT duration FROM files WHERE path = ?").get(path) as
        | { duration: number | null }
        | undefined)?.duration ?? null;

    const proc = Bun.spawn(
      [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin",
        "-i", abs, "-vn", "-ac", "1", "-ar", "1000", "-f", "f32le", "-",
      ],
      { stdout: "pipe", stderr: "pipe" },
    );

    const maxAbs = new Float32Array(PEAK_BUCKETS);
    if (duration && duration > 0) {
      // Duration known → bucket boundaries known up front; stream in O(1) memory.
      const samplesPerBucket = (duration * 1000) / PEAK_BUCKETS;
      let idx = 0;
      const reader = proc.stdout.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = new Float32Array(value.buffer, value.byteOffset, Math.floor(value.byteLength / 4));
        for (let i = 0; i < chunk.length; i++) {
          const b = Math.min(PEAK_BUCKETS - 1, Math.floor(idx / samplesPerBucket));
          const a = Math.abs(chunk[i]);
          if (a > maxAbs[b]) maxAbs[b] = a;
          idx++;
        }
      }
    } else {
      // No duration → buffer the stream, bucket evenly.
      const buf = await new Response(proc.stdout).arrayBuffer();
      const samples = new Float32Array(buf);
      if (samples.length === 0) throw new Error("no samples");
      const per = samples.length / PEAK_BUCKETS;
      for (let i = 0; i < samples.length; i++) {
        const b = Math.min(PEAK_BUCKETS - 1, Math.floor(i / per));
        const a = Math.abs(samples[i]);
        if (a > maxAbs[b]) maxAbs[b] = a;
      }
    }

    const code = await proc.exited;
    if (code !== 0) throw new Error(`ffmpeg exited ${code}`);

    // Normalize to 0.08–0.96; all-silence → flat 0.08.
    let peak = 0;
    for (let i = 0; i < PEAK_BUCKETS; i++) if (maxAbs[i] > peak) peak = maxAbs[i];
    const out = new Float32Array(PEAK_BUCKETS);
    for (let i = 0; i < PEAK_BUCKETS; i++) {
      out[i] = peak === 0 ? 0.08 : 0.08 + 0.88 * (maxAbs[i] / peak);
    }
    return new Uint8Array(out.buffer);
  }
}
