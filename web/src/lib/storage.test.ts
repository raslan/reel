import { afterEach, describe, expect, it } from "vitest";
import { isOnboarded, loadJSON, saveJSON, setOnboarded } from "./storage";

afterEach(() => localStorage.clear());

describe("storage", () => {
  it("round-trips JSON", () => {
    saveJSON("k", { a: 1 });
    expect(loadJSON("k", null)).toEqual({ a: 1 });
  });

  it("falls back on missing or corrupt values", () => {
    expect(loadJSON("missing", 42)).toBe(42);
    localStorage.setItem("bad", "{nope");
    expect(loadJSON("bad", 7)).toBe(7);
  });

  it("tracks the onboarding flag", () => {
    expect(isOnboarded()).toBe(false);
    setOnboarded();
    expect(isOnboarded()).toBe(true);
  });
});
