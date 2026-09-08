import { describe, expect, it } from "vitest";
import { waveColor } from "./wave";

describe("waveColor", () => {
  it("returns rgb strings that vary across the window", () => {
    expect(waveColor(0, 10)).toMatch(/^rgb\(/);
    expect(waveColor(0, 10)).not.toBe(waveColor(9, 10));
  });
});
