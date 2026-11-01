import type { Database } from "bun:sqlite";
import { join } from "node:path";
import type { Roots } from "./config";
import { getFile, getPeaks, setPeaks } from "./db";
import type { EventBus } from "./events";
import { errFields, log } from "./log";

const PEAK_BUCKETS = 1024;
const DEFAULT_DECODE_TIMEOUT_MS = 5 * 60_000;

export type PeaksState = "ready" | "pending" | "failed";

/**
 * Streaming max-per-bucket over little-endian float32 mono samples. Chunks may
 * split a sample anywhere (pipes don't respect 4-byte boundaries) and may start
 * at any byte offset, so leftover bytes are carried into the next `push`.
 */
export class PeakBuckets {
  private readonly max = new Float32Array(PEAK_BUCKETS);
  private carry = new Uint8Array(0);
  private idx = 0;

  constructor(private readonly samplesPerBucket: number) {}

  push(chunk: Uint8Array): void {
    let bytes = chunk;
    if (this.carry.length > 0) {
      bytes = new Uint8Array(this.carry.length + chunk.length);
      bytes.set(this.carry);
      bytes.set(chunk, this.carry.length);
    }
    const whole = bytes.byteLength - (bytes.byteLength % 4);
    const view = new DataView(bytes.buffer, bytes.byteOffset, whole);
    for (let o = 0; o < whole; o += 4) {
      const b = Math.min(PEAK_BUCKETS - 1, Math.floor(this.idx / this.samplesPerBucket));
      const a = Math.abs(view.getFloat32(o, true));
      if (a > this.max[b]!) this.max[b] = a;
      this.idx++;
    }
    this.carry = bytes.slice(whole);
  }

  /** Samples seen so far. */
  get count(): number {
    return this.idx;
  }

  /** 1024 float32 values normalised to 0.08–0.96; all-silence is a flat 0.08. */
  normalized(): Uint8Array {
    let peak = 0;
    for (let i = 0; i < PEAK_BUCKETS; i++) if (this.max[i]! > peak) peak = this.max[i]!;
    const out = new Float32Array(PEAK_BUCKETS);
    for (let i = 0; i < PEAK_BUCKETS; i++) {
      out[i] = peak === 0 ? 0.08 : 0.08 + 0.88 * (this.max[i]! / peak);
    }
    return new Uint8Array(out.buffer);
  }
}

export class PeaksService {
  private queue: string[] = [];
  private running = new Set<string>();
  private failed = new Map<string, number>(); // path -> mtime at failure
  private stopped = false;
  private readonly decodeTimeoutMs: number;
  private readonly ffmpegBin: string;

  constructor(
    private db: Database,
    private roots: Roots,
    private bus: EventBus,
    opts: { decodeTimeoutMs?: number; ffmpegBin?: string } = {},
  ) {
    this.decodeTimeoutMs = opts.decodeTimeoutMs ?? DEFAULT_DECODE_TIMEOUT_MS;
    this.ffmpegBin = opts.ffmpegBin ?? "ffmpeg";
  }

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

  /** Forget in-memory queue + failures; the peaks table is wiped by the caller. */
  clear(): void {
    this.queue.length = 0;
    this.failed.clear();
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
      const file = getFile(this.db, path);
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
      // The index may have been cleared or the file changed while we decoded.
      if (getFile(this.db, path)?.mtime !== mtime) return;
      setPeaks(this.db, path, mtime, peaks);
      this.bus.emit("peaks-ready", { path });
    } catch (err) {
      log("warn", "peaks decode failed", { path, ...errFields(err) });
      this.failed.set(path, mtime);
      this.bus.emit("peaks-failed", { path });
    }
  }

  /** Decode the file to 1024 normalized peak values (0.08–0.96). Throws on failure or timeout. */
  private async decode(path: string): Promise<Uint8Array> {
    const abs = join(this.roots.libraries, path);
    const duration = getFile(this.db, path)?.duration ?? null;

    const proc = Bun.spawn(
      [
        this.ffmpegBin,
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-i",
        abs,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "1000",
        "-f",
        "f32le",
        "-",
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    // A wedged decoder must not stall the (single-lane) queue forever.
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, this.decodeTimeoutMs);
    const stderr = new Response(proc.stderr).text(); // drain so ffmpeg can't block on a full pipe

    try {
      let buckets: PeakBuckets;
      if (duration && duration > 0) {
        // Duration known → bucket boundaries known up front; stream in O(1) memory.
        buckets = new PeakBuckets((duration * 1000) / PEAK_BUCKETS);
        const reader = proc.stdout.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buckets.push(value);
        }
      } else {
        // No duration → buffer the stream, bucket evenly.
        const all = new Uint8Array(await new Response(proc.stdout).arrayBuffer());
        buckets = new PeakBuckets(Math.max(1, Math.floor(all.length / 4)) / PEAK_BUCKETS);
        buckets.push(all);
      }

      // Judge the outcome in order of how informative the error is.
      const code = await proc.exited;
      if (timedOut) throw new Error(`ffmpeg timed out after ${this.decodeTimeoutMs}ms`);
      if (code !== 0) {
        throw new Error(`ffmpeg exited ${code}: ${(await stderr).trim().slice(0, 300)}`);
      }
      if (buckets.count === 0) throw new Error("ffmpeg produced no samples");
      return buckets.normalized();
    } finally {
      clearTimeout(timer);
      if (proc.exitCode === null) proc.kill();
    }
  }
}
