import { describe, expect, it } from "vitest";
import type { FileEntry } from "../types/library";
import { stepIn, stepWrapping } from "./playchain";

describe("stepWrapping", () => {
  const files = [f("a"), f("b"), f("c")];

  it("behaves like stepIn in the middle of the list", () => {
    expect(stepWrapping(files, "a", 1, new Set())?.path).toBe("b");
    expect(stepWrapping(files, "c", -1, new Set())?.path).toBe("b");
  });

  it("wraps from the end to the start and from the start to the end", () => {
    expect(stepWrapping(files, "c", 1, new Set())?.path).toBe("a");
    expect(stepWrapping(files, "a", -1, new Set())?.path).toBe("c");
  });

  it("skips dead files while wrapping", () => {
    expect(stepWrapping(files, "b", 1, new Set(["c", "a"]))?.path).toBe("b");
    expect(stepWrapping(files, "c", 1, new Set(["a"]))?.path).toBe("b");
  });

  it("a single playable file wraps onto itself (so it loops)", () => {
    expect(stepWrapping([f("a")], "a", 1, new Set())?.path).toBe("a");
  });

  it("is null when nothing is playable or the current file isn't in the list", () => {
    expect(stepWrapping(files, "a", 1, new Set(["a", "b", "c"]))).toBeNull();
    expect(stepWrapping(files, "zzz", 1, new Set())).toBeNull();
    expect(stepWrapping([], "a", 1, new Set())).toBeNull();
  });
});

const f = (name: string): FileEntry => ({
  name,
  path: name,
  duration: null,
  size: 0,
  mtime: 0,
});

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
