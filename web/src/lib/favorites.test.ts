import { describe, expect, it } from "vitest";
import type { FileEntry } from "../types/library";
import { applyFavoriteToggle } from "./favorites";

const file = (path: string, duration: number | null = 10): FileEntry => ({
  path,
  name: path.split("/").pop() ?? path,
  duration,
  size: 1,
  mtime: 0,
});

describe("applyFavoriteToggle", () => {
  it("adds the file with its details", () => {
    const next = applyFavoriteToggle({ files: [file("a.mp3")] }, file("b/c.mp3", 42), true);
    expect(next.files.map((f) => f.path)).toEqual(["a.mp3", "b/c.mp3"]);
    expect(next.files[1]?.duration).toBe(42);
  });

  it("adding twice doesn't duplicate", () => {
    const once = applyFavoriteToggle({ files: [] }, file("a.mp3"), true);
    expect(applyFavoriteToggle(once, file("a.mp3"), true).files).toHaveLength(1);
  });

  it("removes by path", () => {
    const next = applyFavoriteToggle(
      { files: [file("a.mp3"), file("b.mp3")] },
      file("a.mp3"),
      false,
    );
    expect(next.files.map((f) => f.path)).toEqual(["b.mp3"]);
  });

  it("does not mutate its input", () => {
    const prev = { files: [file("a.mp3")] };
    applyFavoriteToggle(prev, file("b.mp3"), true);
    applyFavoriteToggle(prev, file("a.mp3"), false);
    expect(prev.files).toHaveLength(1);
  });
});
