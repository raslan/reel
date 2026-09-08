import { describe, expect, it } from "vitest";
import { downsample } from "./downsample";

describe("downsample", () => {
  it("takes the max per bucket", () => {
    expect(downsample([0.1, 0.9, 0.2, 0.4], 2)).toEqual([0.9, 0.4]);
  });

  it("handles more bars than peaks", () => {
    expect(downsample([0.5], 3)).toEqual([0.5, 0, 0]);
  });

  it("returns [] for empty input or non-positive bars", () => {
    expect(downsample([], 12)).toEqual([]);
    expect(downsample([0.5], 0)).toEqual([]);
  });
});
