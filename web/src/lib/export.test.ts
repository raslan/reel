import { describe, expect, it } from "vitest";
import type { FileEntry } from "../types/library";
import { favoritesFileName, formatFavoritesText } from "./export";

const file = (name: string, path: string): FileEntry => ({
  name,
  path,
  duration: 60,
  size: 1,
  mtime: 0,
});

describe("formatFavoritesText", () => {
  it("writes one 'name — path' line per file in the given order", () => {
    expect(
      formatFavoritesText([
        file("b two.mp3", "Shows/B Folder/b two.mp3"),
        file("a.mp3", "Podcasts/a.mp3"),
      ]),
    ).toBe("b two.mp3 — Shows/B Folder/b two.mp3\na.mp3 — Podcasts/a.mp3\n");
  });

  it("is empty for no favorites", () => {
    expect(formatFavoritesText([])).toBe("");
  });
});

describe("favoritesFileName", () => {
  it("uses the local date, zero-padded", () => {
    expect(favoritesFileName(new Date(2026, 10, 8))).toBe("reel-favorites-2026-11-08.txt");
  });
});
