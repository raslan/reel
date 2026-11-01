import { describe, expect, it } from "vitest";
import { BAR_PITCH_PX, barCount, waveColor } from "./wave";

describe("barCount", () => {
  it("keeps today's density: ~72 bars in the width the old desktop waveform had", () => {
    expect(barCount(72 * BAR_PITCH_PX, 99)).toBe(72);
  });

  it("scales with the available width, so a wider strip gets more bars, not fatter ones", () => {
    expect(barCount(1200, 99)).toBeGreaterThan(barCount(600, 99));
    expect(barCount(600, 99)).toBeGreaterThan(barCount(300, 99));
  });

  it("never asks for more bars than the server sends peaks, nor fewer than a recognisable shape", () => {
    expect(barCount(100_000, 99)).toBe(1024);
    expect(barCount(10, 99)).toBe(12);
  });

  it("falls back until the width is known", () => {
    expect(barCount(0, 72)).toBe(72);
    expect(barCount(Number.NaN, 72)).toBe(72);
  });
});

describe("waveColor", () => {
  it("returns rgb strings that vary across the window", () => {
    expect(waveColor(0, 10)).toMatch(/^rgb\(/);
    expect(waveColor(0, 10)).not.toBe(waveColor(9, 10));
  });
});
