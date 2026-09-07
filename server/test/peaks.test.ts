import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { applyWalk, walkLibrary } from "../index";
import { makeStackLite, waitForEvent, writeWav } from "./helpers";

describe("PeaksService", () => {
  test("decodes a wav into 1024 normalized buckets (0.08–0.96)", async () => {
    const s = await makeStackLite({});
    try {
      await writeWav(join(s.roots.libraries, "Podcasts/tone.wav"), 2);
      applyWalk(s.db, "Podcasts", await walkLibrary(s.roots, "Podcasts"));
      const mtime = (
        s.db.query("SELECT mtime FROM files WHERE path = 'Podcasts/tone.wav'").get() as { mtime: number }
      ).mtime;
      const done = waitForEvent(s, "Podcasts/tone.wav", "peaks-ready");
      s.peaks.ensure("Podcasts/tone.wav", mtime);
      await done;
      expect(s.peaks.getState("Podcasts/tone.wav", mtime)).toBe("ready");

      const cached = s.peaks.getCached("Podcasts/tone.wav");
      expect(cached).not.toBeNull();
      expect(cached!.mtime).toBe(mtime);
      const floats = new Float32Array(cached!.data.buffer, cached!.data.byteOffset, cached!.data.byteLength / 4);
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
        s.db.query("SELECT mtime FROM files WHERE path = 'Podcasts/bad.wav'").get() as { mtime: number }
      ).mtime;
      const done = waitForEvent(s, "Podcasts/bad.wav", "peaks-failed");
      s.peaks.ensure("Podcasts/bad.wav", mtime);
      await done;
      s.peaks.ensure("Podcasts/bad.wav", mtime); // same mtime → still failed, no new decode
      expect(s.peaks.getState("Podcasts/bad.wav", mtime)).toBe("failed");
      // a new mtime would be pending again
      expect(s.peaks.getState("Podcasts/bad.wav", mtime + 1)).toBe("pending");
    } finally {
      await s.stopPeaks();
      await s.cleanup();
    }
  });

  test("all-silence decodes to a flat 0.08 floor", async () => {
    const s = await makeStackLite({});
    try {
      await writeWav(join(s.roots.libraries, "Podcasts/silence.wav"), 1, 8000, 0); // freq 0 → zeros
      applyWalk(s.db, "Podcasts", await walkLibrary(s.roots, "Podcasts"));
      const mtime = (
        s.db.query("SELECT mtime FROM files WHERE path = 'Podcasts/silence.wav'").get() as { mtime: number }
      ).mtime;
      const done = waitForEvent(s, "Podcasts/silence.wav", "peaks-ready");
      s.peaks.ensure("Podcasts/silence.wav", mtime);
      await done;
      const cached = s.peaks.getCached("Podcasts/silence.wav")!;
      const floats = new Float32Array(cached.data.buffer, cached.data.byteOffset, cached.data.byteLength / 4);
      for (const v of floats) expect(v).toBeCloseTo(0.08, 5);
    } finally {
      await s.stopPeaks();
      await s.cleanup();
    }
  });
});
