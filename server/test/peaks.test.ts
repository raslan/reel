import { describe, expect, spyOn, test } from "bun:test";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { applyWalk, walkLibrary } from "../index";
import { PeakBuckets, PeaksService } from "../peaks";
import { makeStackLite, makeTempDir, waitForEvent, writeWav } from "./helpers";

/** Capture what the structured logger prints; call the returned function to stop and read it. */
function spyOnLog(): () => string {
  const spy = spyOn(console, "log").mockImplementation(() => {});
  return () => {
    const out = spy.mock.calls.map((c) => String(c[0])).join("\n");
    spy.mockRestore();
    return out;
  };
}

const f32 = (values: number[]) => new Uint8Array(new Float32Array(values).buffer);

describe("PeakBuckets", () => {
  // 2048 samples over 1024 buckets → 2 samples each; bucket i peaks at (i + 1) / 1024.
  const samples = Array.from({ length: 2048 }, (_, i) => (Math.floor(i / 2) + 1) / 1024);
  const reference = () => {
    const b = new PeakBuckets(2);
    b.push(f32(samples));
    return b.normalized();
  };

  test("chunks split mid-sample give the same result as one big chunk", () => {
    const bytes = f32(samples);
    for (const size of [1, 3, 5, 4093]) {
      const b = new PeakBuckets(2);
      for (let o = 0; o < bytes.length; o += size) b.push(bytes.subarray(o, o + size));
      expect(b.count).toBe(2048);
      expect(b.normalized()).toEqual(reference());
    }
  });

  test("a chunk at an unaligned byte offset is read correctly (no RangeError)", () => {
    const bytes = f32(samples);
    const padded = new Uint8Array(bytes.length + 1);
    padded.set(bytes, 1);
    const b = new PeakBuckets(2);
    b.push(padded.subarray(1)); // byteOffset 1 → not a multiple of 4
    expect(b.normalized()).toEqual(reference());
  });

  test("normalizes to 0.08–0.96, and silence to a flat 0.08", () => {
    const loud = new PeakBuckets(2);
    loud.push(f32(samples));
    const out = new Float32Array(loud.normalized().buffer);
    expect(Math.max(...out)).toBeCloseTo(0.96, 5);
    expect(Math.min(...out)).toBeGreaterThanOrEqual(0.08);

    const quiet = new PeakBuckets(2);
    quiet.push(f32(new Array(2048).fill(0)));
    expect(new Float32Array(quiet.normalized().buffer).every((v) => Math.abs(v - 0.08) < 1e-6)).toBe(
      true,
    );
  });
});

describe("PeaksService", () => {
  test("decodes a wav into 1024 normalized buckets (0.08–0.96)", async () => {
    const s = await makeStackLite({});
    try {
      await writeWav(join(s.roots.libraries, "Podcasts/tone.wav"), 2);
      applyWalk(s.db, "Podcasts", await walkLibrary(s.roots, "Podcasts"));
      const mtime = (
        s.db.query("SELECT mtime FROM files WHERE path = 'Podcasts/tone.wav'").get() as {
          mtime: number;
        }
      ).mtime;
      const done = waitForEvent(s, "Podcasts/tone.wav", "peaks-ready");
      s.peaks.ensure("Podcasts/tone.wav", mtime);
      await done;
      expect(s.peaks.getState("Podcasts/tone.wav", mtime)).toBe("ready");

      const cached = s.peaks.getCached("Podcasts/tone.wav");
      expect(cached).not.toBeNull();
      expect(cached!.mtime).toBe(mtime);
      const floats = new Float32Array(
        cached!.data.buffer,
        cached!.data.byteOffset,
        cached!.data.byteLength / 4,
      );
      expect(floats.length).toBe(1024);
      for (const v of floats) {
        expect(v).toBeGreaterThanOrEqual(0.08);
        expect(v).toBeLessThanOrEqual(0.96);
      }
      expect(Math.max(...Array.from(floats))).toBeGreaterThan(0.9);
    } finally {
      await s.stopPeaks();
      await s.cleanup();
    }
  });

  test("a failed decode is latched per mtime and not retried", async () => {
    const s = await makeStackLite({});
    try {
      const p = join(s.roots.libraries, "Podcasts/bad.wav");
      await Bun.write(p, "this is not audio");
      applyWalk(s.db, "Podcasts", await walkLibrary(s.roots, "Podcasts"));
      const mtime = (
        s.db.query("SELECT mtime FROM files WHERE path = 'Podcasts/bad.wav'").get() as {
          mtime: number;
        }
      ).mtime;
      const done = waitForEvent(s, "Podcasts/bad.wav", "peaks-failed");
      const logged = spyOnLog();
      s.peaks.ensure("Podcasts/bad.wav", mtime);
      await done;
      expect(logged()).toContain("ffmpeg exited"); // the real reason, not a downstream symptom
      s.peaks.ensure("Podcasts/bad.wav", mtime); // same mtime → still failed, no new decode
      expect(s.peaks.getState("Podcasts/bad.wav", mtime)).toBe("failed");
      // a new mtime would be pending again
      expect(s.peaks.getState("Podcasts/bad.wav", mtime + 1)).toBe("pending");
    } finally {
      await s.stopPeaks();
      await s.cleanup();
    }
  });

  test("a hung decoder is killed at the timeout, fails the file, and frees the queue", async () => {
    const s = await makeStackLite({});
    const fake = await makeTempDir("reel-fake-ffmpeg-");
    try {
      const script = join(fake.dir, "ffmpeg");
      await Bun.write(script, "#!/bin/sh\nexec sleep 30\n");
      await chmod(script, 0o755);

      await writeWav(join(s.roots.libraries, "Podcasts/tone.wav"), 1);
      applyWalk(s.db, "Podcasts", await walkLibrary(s.roots, "Podcasts"));
      const mtime = (
        s.db.query("SELECT mtime FROM files WHERE path = 'Podcasts/tone.wav'").get() as {
          mtime: number;
        }
      ).mtime;

      const svc = new PeaksService(s.db, s.roots, s.bus, {
        decodeTimeoutMs: 300,
        ffmpegBin: script,
      });
      const failed = waitForEvent(s, "Podcasts/tone.wav", "peaks-failed");
      const logged = spyOnLog();
      const t0 = performance.now();
      svc.ensure("Podcasts/tone.wav", mtime);
      await failed;
      expect(performance.now() - t0).toBeLessThan(5000);
      expect(logged()).toContain("timed out");
      expect(svc.getState("Podcasts/tone.wav", mtime)).toBe("failed");
      await svc.stop(); // nothing left running
    } finally {
      await fake.cleanup();
      await s.cleanup();
    }
  });

  test("all-silence decodes to a flat 0.08 floor", async () => {
    const s = await makeStackLite({});
    try {
      await writeWav(join(s.roots.libraries, "Podcasts/silence.wav"), 1, 8000, 0); // freq 0 → zeros
      applyWalk(s.db, "Podcasts", await walkLibrary(s.roots, "Podcasts"));
      const mtime = (
        s.db.query("SELECT mtime FROM files WHERE path = 'Podcasts/silence.wav'").get() as {
          mtime: number;
        }
      ).mtime;
      const done = waitForEvent(s, "Podcasts/silence.wav", "peaks-ready");
      s.peaks.ensure("Podcasts/silence.wav", mtime);
      await done;
      const cached = s.peaks.getCached("Podcasts/silence.wav")!;
      const floats = new Float32Array(
        cached.data.buffer,
        cached.data.byteOffset,
        cached.data.byteLength / 4,
      );
      for (const v of floats) expect(v).toBeCloseTo(0.08, 5);
    } finally {
      await s.stopPeaks();
      await s.cleanup();
    }
  });
});
