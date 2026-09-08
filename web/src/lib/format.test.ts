import { describe, expect, it } from "vitest";
import { fmt } from "./format";

describe("fmt", () => {
  it("formats seconds as m:ss (mockup: no hours, minutes keep counting)", () => {
    expect(fmt(0)).toBe("0:00");
    expect(fmt(59.9)).toBe("0:59");
    expect(fmt(61)).toBe("1:01");
    expect(fmt(3661)).toBe("61:01");
    expect(fmt(7325)).toBe("122:05");
  });

  it("returns an en dash for unknown duration", () => {
    expect(fmt(null)).toBe("–");
    expect(fmt(Number.NaN)).toBe("–");
  });
});
