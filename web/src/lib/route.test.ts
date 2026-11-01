import { describe, expect, it } from "vitest";
import { formatHash, parseHash } from "./route";

describe("parseHash", () => {
  it("reads the screen and library folder", () => {
    expect(parseHash("#/favorites")).toEqual({ screen: "favorites", folderPath: "" });
    expect(parseHash("#/settings")).toEqual({ screen: "settings", folderPath: "" });
    expect(parseHash("#/library")).toEqual({ screen: "library", folderPath: "" });
    expect(parseHash("#/library/Podcasts/Ep%201")).toEqual({
      screen: "library",
      folderPath: "Podcasts/Ep 1",
    });
  });

  it("falls back to the library root for empty or unknown hashes", () => {
    for (const h of ["", "#", "#/", "#/nope", "#/nope/x"]) {
      expect(parseHash(h)).toEqual({ screen: "library", folderPath: "" });
    }
  });

  it("ignores folders on screens that have none, and tolerates stray slashes", () => {
    expect(parseHash("#/search/whatever").folderPath).toBe("");
    expect(parseHash("#/library//A///B/").folderPath).toBe("A/B");
  });

  it("rejects traversal and broken escapes", () => {
    for (const h of ["#/library/..", "#/library/a/../b", "#/library/a%2Fb", "#/library/%E0%A4%A"]) {
      expect(parseHash(h)).toEqual({ screen: "library", folderPath: "" });
    }
  });
});

describe("formatHash", () => {
  it("round-trips, escaping awkward folder names", () => {
    const routes = [
      { screen: "library" as const, folderPath: "" },
      { screen: "library" as const, folderPath: "Podcasts/Ep 1 #2/100%?" },
      { screen: "search" as const, folderPath: "" },
      { screen: "favorites" as const, folderPath: "" },
      { screen: "settings" as const, folderPath: "" },
    ];
    for (const r of routes) expect(parseHash(formatHash(r))).toEqual(r);
    expect(formatHash(routes[1] as (typeof routes)[number])).toBe(
      "#/library/Podcasts/Ep%201%20%232/100%25%3F",
    );
  });

  it("only the library screen carries a folder", () => {
    expect(formatHash({ screen: "settings", folderPath: "A" })).toBe("#/settings");
  });
});
