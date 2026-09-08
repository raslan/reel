import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "./engine";

interface FakeAudio {
  src: string;
  paused: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;
  preservesPitch: boolean;
  listeners: Map<string, Set<() => void>>;
  play: () => Promise<void>;
  pause: () => void;
  addEventListener: (t: string, fn: () => void, opts?: { once?: boolean }) => void;
  removeEventListener: (t: string, fn: () => void) => void;
  removeAttribute: (t: string) => void;
  load: () => void;
}

function fakeAudio(): FakeAudio {
  const listeners = new Map<string, Set<() => void>>();
  const fire = (t: string) => {
    listeners.get(t)?.forEach((fn) => {
      fn();
    });
  };
  return {
    src: "",
    paused: true,
    currentTime: 0,
    duration: NaN,
    playbackRate: 1,
    volume: 1,
    preservesPitch: false,
    listeners,
    play() {
      this.paused = false;
      fire("play");
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
      fire("pause");
    },
    addEventListener(t, fn, opts) {
      let set = listeners.get(t);
      if (!set) {
        set = new Set();
        listeners.set(t, set);
      }
      if (opts?.once) {
        const wrapped = () => {
          set.delete(wrapped);
          fn();
        };
        set.add(wrapped);
      } else {
        set.add(fn);
      }
    },
    removeEventListener(t, fn) {
      listeners.get(t)?.delete(fn);
    },
    removeAttribute() {},
    load() {},
  };
}

const asElement = (fake: FakeAudio) => fake as unknown as HTMLAudioElement;

describe("AudioEngine", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("load sets an encoded /audio src and autoplays when asked", () => {
    const fake = fakeAudio();
    const engine = new AudioEngine(asElement(fake));
    engine.load("ASMR & F/lo-fi/tone.mp3", true);
    expect(fake.src).toBe("/audio/ASMR%20%26%20F%2Flo-fi%2Ftone.mp3");
    expect(fake.paused).toBe(false);
  });

  it("emits play and pause events", () => {
    const engine = new AudioEngine(asElement(fakeAudio()));
    const onPlay = vi.fn();
    const onPause = vi.fn();
    engine.on("play", onPlay);
    engine.on("pause", onPause);
    engine.play();
    expect(onPlay).toHaveBeenCalledTimes(1);
    engine.pause();
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it("emits error with the loaded path on media error", () => {
    const fake = fakeAudio();
    const engine = new AudioEngine(asElement(fake));
    const onErr = vi.fn();
    engine.on("error", onErr);
    engine.load("a/b.mp3", false);
    fake.listeners.get("error")?.forEach((fn) => {
      fn();
    });
    expect(onErr).toHaveBeenCalledWith("a/b.mp3");
  });

  it("ignores stale errors after a newer load", () => {
    const fake = fakeAudio();
    const engine = new AudioEngine(asElement(fake));
    const onErr = vi.fn();
    engine.on("error", onErr);
    engine.load("old.mp3", false);
    engine.load("new.mp3", false);
    fake.listeners.get("error")?.forEach((fn) => {
      fn();
    });
    expect(onErr).toHaveBeenCalledTimes(1);
    expect(onErr).toHaveBeenCalledWith("new.mp3");
  });

  it("clamps seeks to the known duration", () => {
    const fake = fakeAudio();
    fake.duration = 100;
    const engine = new AudioEngine(asElement(fake));
    engine.seek(1000);
    expect(fake.currentTime).toBe(99.95);
    engine.seek(-5);
    expect(fake.currentTime).toBe(0);
  });

  it("calls sinks with position and duration while playing, not while paused", () => {
    vi.useFakeTimers();
    const fake = fakeAudio();
    fake.duration = 100;
    const engine = new AudioEngine(asElement(fake));
    const sink = vi.fn();
    engine.registerSink(sink);
    engine.play();
    vi.advanceTimersByTime(16);
    expect(sink).toHaveBeenCalledWith(0, 100);
    engine.pause();
    const calls = sink.mock.calls.length;
    vi.advanceTimersByTime(100);
    expect(sink.mock.calls.length).toBe(calls);
  });
});
