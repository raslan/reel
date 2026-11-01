import { describe, expect, it } from "vitest";
import type { FileEntry } from "../types/library";
import { sortFiles } from "./sort";

const f = (name: string, duration: number | null = null): FileEntry => ({
  name,
  path: name,
  duration,
  size: 0,
  mtime: 0,
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

  it("sorts by modified time and by size, name breaking ties", () => {
    const a = { ...f("a.mp3"), mtime: 300, size: 5 };
    const b = { ...f("b.mp3"), mtime: 100, size: 5 };
    const c = { ...f("c.mp3"), mtime: 200, size: 9 };
    const names = (key: "modified" | "size", dir: 1 | -1) =>
      sortFiles([a, b, c], { key, dir }).map((x) => x.name);
    expect(names("modified", 1)).toEqual(["b.mp3", "c.mp3", "a.mp3"]);
    expect(names("modified", -1)).toEqual(["a.mp3", "c.mp3", "b.mp3"]);
    expect(names("size", 1)).toEqual(["a.mp3", "b.mp3", "c.mp3"]);
    expect(names("size", -1)).toEqual(["c.mp3", "a.mp3", "b.mp3"]);
  });

  it("sorts by duration, unknowns last, name as tiebreak", () => {
    const out = sortFiles([f("z.mp3"), f("a.mp3", 10), f("b.mp3", 5)], { key: "duration", dir: 1 });
    expect(out.map((x) => x.name)).toEqual(["b.mp3", "a.mp3", "z.mp3"]);
  });
});
