import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { favoritesKey, folderKey, peaksKey, rescanKey, searchKey } from "./keys";
import { describeRescan, invalidateForEvent } from "./libraryEvents";

describe("describeRescan", () => {
  it("lists only the non-zero counts, or null when nothing changed", () => {
    expect(describeRescan({ added: 3, removed: 0, changed: 1 })).toBe("3 added, 1 changed");
    expect(describeRescan({ removed: 2 })).toBe("2 removed");
    expect(describeRescan({ added: 0, removed: 0, changed: 0 })).toBeNull();
    expect(describeRescan({})).toBeNull();
  });
});

function seeded() {
  const qc = new QueryClient();
  const keys = {
    root: folderKey(""),
    pod: folderKey("Pod"),
    podSub: folderKey("Pod/Sub"),
    podcast: folderKey("Podcast"), // shares a prefix with "Pod" but is a different library
    other: folderKey("Other"),
    search: searchKey("x", null),
    favorites: favoritesKey,
    peaks: peaksKey("Pod/a.mp3"),
    otherPeaks: peaksKey("Other/b.mp3"),
    rescan: rescanKey,
  };
  for (const key of Object.values(keys)) qc.setQueryData(key, {});
  const stale = () =>
    Object.fromEntries(
      Object.entries(keys).map(([name, key]) => [name, qc.getQueryState(key)?.isInvalidated]),
    );
  return { qc, stale };
}

describe("invalidateForEvent", () => {
  it("library-changed refreshes that library's folders, the root, search and favorites", () => {
    const { qc, stale } = seeded();
    invalidateForEvent(qc, "library-changed", "Pod");
    expect(stale()).toMatchObject({
      root: true,
      pod: true,
      podSub: true,
      search: true,
      favorites: true,
      podcast: false,
      other: false,
      peaks: false,
      rescan: false,
    });
  });

  it("library-changed with no path refreshes every folder", () => {
    const { qc, stale } = seeded();
    invalidateForEvent(qc, "library-changed", undefined);
    expect(stale()).toMatchObject({ root: true, pod: true, other: true, podcast: true });
  });

  it("libraries-changed (clear) refreshes folders, search and favorites", () => {
    const { qc, stale } = seeded();
    invalidateForEvent(qc, "libraries-changed", undefined);
    expect(stale()).toMatchObject({
      root: true,
      pod: true,
      other: true,
      search: true,
      favorites: true,
      peaks: false,
    });
  });

  it("peaks events refresh only that file's peaks", () => {
    for (const name of ["peaks-ready", "peaks-failed"] as const) {
      const { qc, stale } = seeded();
      invalidateForEvent(qc, name, "Pod/a.mp3");
      expect(stale()).toMatchObject({
        peaks: true,
        otherPeaks: false,
        pod: false,
        favorites: false,
      });
    }
  });

  it("rescan events refresh the rescan status (and the library data on success)", () => {
    const failed = seeded();
    invalidateForEvent(failed.qc, "rescan-failed", undefined);
    expect(failed.stale()).toMatchObject({ rescan: true, pod: false });

    const done = seeded();
    invalidateForEvent(done.qc, "rescan-finished", undefined);
    expect(done.stale()).toMatchObject({ rescan: true, pod: true, favorites: true, search: true });
  });
});
