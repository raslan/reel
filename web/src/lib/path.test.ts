import { describe, expect, it } from "vitest";
import { parentFolder } from "./path";

describe("parentFolder", () => {
  it("strips the last segment", () => {
    expect(parentFolder("a/b/c.mp3")).toBe("a/b");
    expect(parentFolder("c.mp3")).toBe("");
  });
});
