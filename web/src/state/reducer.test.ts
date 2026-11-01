import { describe, expect, it } from "vitest";
import { appReducer, initialState } from "./reducer";

const entry = (path: string) => ({
  path,
  name: path.split("/").pop() ?? path,
  duration: null,
  size: 0,
  mtime: 0,
});

const play = (path = "a/b.mp3", queue = [entry(path)]) => ({
  type: "playFile" as const,
  file: { path, name: "b.mp3", folderPath: "a", duration: null },
  queue,
});

describe("appReducer", () => {
  it("navigate adopts a URL's screen and folder, clearing the folder search only when the folder changes", () => {
    let s = initialState();
    s = appReducer(s, { type: "setFolderQuery", query: "rain" });
    const same = appReducer(s, { type: "navigate", screen: "library", folderPath: "" });
    expect(same).toBe(s);
    s = appReducer(s, { type: "navigate", screen: "favorites", folderPath: "" });
    expect(s).toMatchObject({ screen: "favorites", folderQuery: "rain" });
    s = appReducer(s, { type: "navigate", screen: "library", folderPath: "a/b" });
    expect(s).toMatchObject({ screen: "library", folderPath: "a/b", folderQuery: "" });
  });

  it("starts on the route it is given", () => {
    expect(initialState({}, { screen: "library", folderPath: "x/y" })).toMatchObject({
      screen: "library",
      folderPath: "x/y",
    });
  });

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

  it("playFile snapshots the queue it was played from", () => {
    const queue = [entry("x/1.mp3"), entry("y/2.mp3"), entry("z/3.mp3")];
    const s = appReducer(initialState(), play("y/2.mp3", queue));
    expect(s.queue).toEqual(queue);
  });

  it("setQueue swaps the queue without touching what's playing", () => {
    let s = appReducer(initialState(), play("y/2.mp3"));
    const queue = [entry("a.mp3"), entry("y/2.mp3")];
    s = appReducer(s, { type: "setQueue", queue });
    expect(s.queue).toEqual(queue);
    expect(s.current?.path).toBe("y/2.mp3");
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

  it("clearDead forgets every dead path", () => {
    let s = appReducer(initialState(), { type: "markDead", path: "x" });
    s = appReducer(s, { type: "markDead", path: "y" });
    s = appReducer(s, { type: "clearDead" });
    expect(s.deadPaths).toEqual([]);
  });

  it("explicitly playing a dead file gives it another chance", () => {
    let s = appReducer(initialState(), { type: "markDead", path: "a/b.mp3" });
    s = appReducer(s, { type: "markDead", path: "other.mp3" });
    s = appReducer(s, play("a/b.mp3"));
    expect(s.deadPaths).toEqual(["other.mp3"]);
  });

  it("initialState takes persisted prefs", () => {
    const sort = { key: "duration" as const, dir: -1 as const };
    const s = initialState({ volume: 30, speed: 1.5, sort });
    expect(s).toMatchObject({ volume: 30, speed: 1.5, sort });
    expect(initialState()).toMatchObject({ volume: 100, speed: 1, sort: { key: "name", dir: 1 } });
  });

  it("cycleRepeat walks off → queue → one → off", () => {
    let s = initialState();
    expect(s.repeat).toBe("off");
    const seen = [];
    for (let i = 0; i < 4; i++) {
      s = appReducer(s, { type: "cycleRepeat" });
      seen.push(s.repeat);
    }
    expect(seen).toEqual(["queue", "one", "off", "queue"]);
  });

  it("initialState restores a persisted repeat mode", () => {
    expect(initialState({ repeat: "one" }).repeat).toBe("one");
  });

  it("toggleMute silences and then restores the previous volume", () => {
    let s = appReducer(initialState({ volume: 70 }), { type: "toggleMute" });
    expect(s.volume).toBe(0);
    s = appReducer(s, { type: "toggleMute" });
    expect(s.volume).toBe(70);
    expect(s.mutedFrom).toBeNull();
  });

  it("unmuting from a persisted volume of 0 falls back to a sensible level", () => {
    const s = appReducer(initialState({ volume: 0 }), { type: "toggleMute" });
    expect(s.volume).toBe(50);
  });

  it("moving the volume slider while muted cancels the remembered volume", () => {
    let s = appReducer(initialState({ volume: 70 }), { type: "toggleMute" });
    s = appReducer(s, { type: "setVolume", volume: 20 });
    expect(s).toMatchObject({ volume: 20, mutedFrom: null });
    s = appReducer(s, { type: "toggleMute" });
    s = appReducer(s, { type: "toggleMute" });
    expect(s.volume).toBe(20);
  });

  it("zen opens and toggles closed", () => {
    let s = appReducer(initialState(), { type: "openZen" });
    expect(s.zen).toBe(true);
    s = appReducer(s, { type: "toggleZen" });
    expect(s.zen).toBe(false);
  });
});
