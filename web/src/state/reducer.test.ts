import { describe, expect, it } from "vitest";
import { appReducer, initialState } from "./reducer";

const play = (path = "a/b.mp3") => ({
  type: "playFile" as const,
  file: { path, name: "b.mp3", folderPath: "a", duration: null },
});

describe("appReducer", () => {
  it("navigates folders and clears the in-folder query", () => {
    let s = initialState();
    s = appReducer(s, { type: "setFolderPath", path: "a" });
    s = appReducer(s, { type: "setFolderQuery", query: "x" });
    s = appReducer(s, { type: "setFolderPath", path: "a/b" });
    expect(s.folderPath).toBe("a/b");
    expect(s.folderQuery).toBe("");
  });

  it("playFile sets current and playing", () => {
    const s = appReducer(initialState(), play());
    expect(s.current?.path).toBe("a/b.mp3");
    expect(s.playing).toBe(true);
  });

  it("setDuration updates the current file", () => {
    let s = appReducer(initialState(), play());
    s = appReducer(s, { type: "setDuration", duration: 42 });
    expect(s.current?.duration).toBe(42);
  });

  it("cycleSpeed walks the speed list and wraps", () => {
    let s = initialState();
    s = appReducer(s, { type: "cycleSpeed" });
    expect(s.speed).toBe(1.25);
    for (let i = 0; i < 5; i++) s = appReducer(s, { type: "cycleSpeed" });
    expect(s.speed).toBe(1);
  });

  it("setVolume clamps to 0..100", () => {
    expect(appReducer(initialState(), { type: "setVolume", volume: 150 }).volume).toBe(100);
    expect(appReducer(initialState(), { type: "setVolume", volume: -5 }).volume).toBe(0);
  });

  it("markDead records a path once", () => {
    let s = appReducer(initialState(), { type: "markDead", path: "x" });
    s = appReducer(s, { type: "markDead", path: "x" });
    expect(s.deadPaths).toEqual(["x"]);
  });

  it("zen opens and toggles closed", () => {
    let s = appReducer(initialState(), { type: "openZen" });
    expect(s.zen).toBe(true);
    s = appReducer(s, { type: "toggleZen" });
    expect(s.zen).toBe(false);
  });
});
