import { describe, expect, it } from "vitest";
import type { FileEntry } from "../types/library";
import { stepIn } from "./playchain";

const f = (name: string): FileEntry => ({ name, path: name, duration: null, size: 0 });

describe("stepIn", () => {
  it("steps forward within the folder", () => {
    const files = [f("a"), f("b"), f("c")];
    expect(stepIn(files, "a", 1, new Set())?.path).toBe("b");
  });

  it("stops at the end of the chain", () => {
    const files = [f("a"), f("b")];
    expect(stepIn(files, "b", 1, new Set())).toBeNull();
  });

  it("skips dead files", () => {
    const files = [f("a"), f("b"), f("c")];
    expect(stepIn(files, "a", 1, new Set(["b"]))?.path).toBe("c");
  });

  it("returns null when the rest of the chain is dead", () => {
    const files = [f("a"), f("b"), f("c")];
    expect(stepIn(files, "a", 1, new Set(["b", "c"]))).toBeNull();
  });

  it("steps backward and stops at the start", () => {
    const files = [f("a"), f("b"), f("c")];
    expect(stepIn(files, "c", -1, new Set())?.path).toBe("b");
    expect(stepIn(files, "a", -1, new Set())).toBeNull();
  });

  it("returns null for an unknown current path", () => {
    expect(stepIn([f("a")], "zzz", 1, new Set())).toBeNull();
  });
});
