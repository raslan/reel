import { describe, expect, it } from "vitest";
import type { FileEntry } from "../types/library";
import { sortFiles } from "./sort";

const f = (name: string, duration: number | null = null): FileEntry => ({
  name,
  path: name,
  duration,
  size: 0,
});

describe("sortFiles", () => {
  it("sorts by name case-insensitively with numeric awareness", () => {
    const out = sortFiles([f("b.mp3"), f("A10.mp3"), f("a2.mp3")], { key: "name", dir: 1 });
    expect(out.map((x) => x.name)).toEqual(["a2.mp3", "A10.mp3", "b.mp3"]);
  });

  it("reverses with dir -1", () => {
    const out = sortFiles([f("a.mp3"), f("b.mp3")], { key: "name", dir: -1 });
    expect(out.map((x) => x.name)).toEqual(["b.mp3", "a.mp3"]);
  });

  it("sorts by duration, unknowns last, name as tiebreak", () => {
    const out = sortFiles([f("z.mp3"), f("a.mp3", 10), f("b.mp3", 5)], { key: "duration", dir: 1 });
    expect(out.map((x) => x.name)).toEqual(["b.mp3", "a.mp3", "z.mp3"]);
  });
});
