import { afterEach, describe, expect, it } from "vitest";
import { loadPrefs, REPEAT_KEY, SORT_KEY, SPEED_KEY, VOLUME_KEY } from "./prefs";

const store = (key: string, value: unknown) =>
  localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));

describe("loadPrefs", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("falls back to defaults when nothing is stored", () => {
    expect(loadPrefs()).toEqual({
      volume: 100,
      speed: 1,
      sort: { key: "name", dir: 1 },
      repeat: "off",
    });
  });

  it("restores valid stored values", () => {
    store(VOLUME_KEY, 40);
    store(SPEED_KEY, 1.5);
    store(SORT_KEY, { key: "duration", dir: -1 });
    store(REPEAT_KEY, '"queue"');
    expect(loadPrefs()).toEqual({
      volume: 40,
      speed: 1.5,
      sort: { key: "duration", dir: -1 },
      repeat: "queue",
    });
  });

  it("only accepts the known repeat modes", () => {
    for (const mode of ["off", "queue", "one"]) {
      store(REPEAT_KEY, JSON.stringify(mode));
      expect(loadPrefs().repeat).toBe(mode);
    }
    for (const bad of ['"all"', "1", "null", "true", '""', "queue"]) {
      store(REPEAT_KEY, bad); // wrong values, and an unquoted (invalid JSON) string
      expect(loadPrefs().repeat).toBe("off");
    }
  });

  it("clamps and rounds volume, and rejects non-numbers", () => {
    store(VOLUME_KEY, 250);
    expect(loadPrefs().volume).toBe(100);
    store(VOLUME_KEY, -3);
    expect(loadPrefs().volume).toBe(0);
    store(VOLUME_KEY, 33.6);
    expect(loadPrefs().volume).toBe(34);
    for (const bad of ['"loud"', "null", "{}", "NaN"]) {
      store(VOLUME_KEY, bad);
      expect(loadPrefs().volume).toBe(100);
    }
  });

  it("only accepts speeds from the supported list", () => {
    store(SPEED_KEY, 3);
    expect(loadPrefs().speed).toBe(1);
    store(SPEED_KEY, "fast");
    expect(loadPrefs().speed).toBe(1);
    store(SPEED_KEY, 0.75);
    expect(loadPrefs().speed).toBe(0.75);
  });

  it("rejects malformed sort values and corrupt JSON", () => {
    store(SORT_KEY, { key: "size", dir: -1 });
    expect(loadPrefs().sort).toEqual({ key: "size", dir: -1 });
    for (const bad of [{ key: "color", dir: 1 }, { key: "name", dir: 2 }, "name", null, [1]]) {
      store(SORT_KEY, bad);
      expect(loadPrefs().sort).toEqual({ key: "name", dir: 1 });
    }
    store(SORT_KEY, "{not json");
    expect(loadPrefs().sort).toEqual({ key: "name", dir: 1 });
  });
});
