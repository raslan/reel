import { describe, expect, it } from "vitest";
import { describeMediaError } from "./mediaError";

describe("describeMediaError", () => {
  it("treats a network error as transient: don't blacklist the file", () => {
    const r = describeMediaError("ep.mp3", 2);
    expect(r.dead).toBe(false);
    expect(r.message).toContain("ep.mp3");
    expect(r.message.toLowerCase()).toContain("network");
  });

  it("treats a decode error as the file's fault", () => {
    const r = describeMediaError("ep.mp3", 3);
    expect(r.dead).toBe(true);
    expect(r.message.toLowerCase()).toContain("decoded");
  });

  it("treats missing/unsupported (and unknown) as the file's fault", () => {
    for (const code of [4, null]) {
      const r = describeMediaError("ep.mp3", code);
      expect(r.dead).toBe(true);
      expect(r.message.toLowerCase()).toContain("missing");
    }
  });

  it("treats an aborted load like a transient failure", () => {
    expect(describeMediaError("ep.mp3", 1).dead).toBe(false);
  });
});
