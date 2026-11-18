import { describe, expect, it } from "vitest";
import { folderLabel, parentFolder } from "./path";

describe("parentFolder", () => {
  it("strips the last segment", () => {
    expect(parentFolder("a/b/c.mp3")).toBe("a/b");
    expect(parentFolder("c.mp3")).toBe("");
  });
});

describe("folderLabel", () => {
  const aliases = { Podcasts: "Shows", "Podcasts/Comedy": "Standup" };

  it("uses an alias when the path has one", () => {
    expect(folderLabel(aliases, "Podcasts")).toBe("Shows");
    expect(folderLabel(aliases, "Podcasts/Comedy")).toBe("Standup");
  });

  it("falls back to the last real path segment", () => {
    expect(folderLabel(aliases, "Podcasts/News")).toBe("News");
    expect(folderLabel({}, "Deep/Nested/Folder")).toBe("Folder");
  });

  it("labels the root", () => {
    expect(folderLabel(aliases, "")).toBe("Library");
  });
});
