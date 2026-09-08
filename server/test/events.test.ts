import { describe, expect, test } from "bun:test";
import { createBus } from "../events";

describe("EventBus", () => {
  test("emit reaches all subscribers with event name and data", () => {
    const bus = createBus();
    const a: [string, unknown][] = [];
    const b: [string, unknown][] = [];
    bus.subscribe((event, data) => a.push([event, data]));
    bus.subscribe((event, data) => b.push([event, data]));
    bus.emit("library-changed");
    bus.emit("peaks-ready", { path: "x.wav" });
    expect(a).toEqual([
      ["library-changed", undefined],
      ["peaks-ready", { path: "x.wav" }],
    ]);
    expect(b).toEqual(a);
  });

  test("unsubscribe stops delivery", () => {
    const bus = createBus();
    const seen: string[] = [];
    const off = bus.subscribe((event) => seen.push(event));
    bus.emit("a");
    off();
    bus.emit("b");
    expect(seen).toEqual(["a"]);
  });

  test("a throwing writer is removed; others keep receiving", () => {
    const bus = createBus();
    const seen: string[] = [];
    bus.subscribe(() => {
      throw new Error("boom");
    });
    bus.subscribe((event) => seen.push(event));
    bus.emit("a");
    bus.emit("b");
    expect(seen).toEqual(["a", "b"]);
  });
});
