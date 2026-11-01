import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "./engine";

interface FakeAudio {
  src: string;
  paused: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  defaultPlaybackRate: number;
  volume: number;
  preservesPitch: boolean;
  /** MediaError-like, as set by the browser before it fires "error". */
  error: { code: number } | null;
  /** Make the next play() reject (e.g. the autoplay policy) without starting playback. */
  rejectPlay: boolean;
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
    defaultPlaybackRate: 1,
    volume: 1,
    preservesPitch: false,
    error: null,
    rejectPlay: false,
    listeners,
    play() {
      if (this.rejectPlay) {
        return Promise.reject(new DOMException("blocked", "NotAllowedError"));
      }
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

  it("keeps one error listener no matter how many files were loaded", () => {
    const fake = fakeAudio();
    const engine = new AudioEngine(asElement(fake));
    for (let i = 0; i < 5; i++) engine.load(`f${i}.mp3`, false);
    expect(fake.listeners.get("error")?.size).toBe(1);
  });

  it("exposes the media error code and a null code when there is no error", () => {
    const fake = fakeAudio();
    const engine = new AudioEngine(asElement(fake));
    expect(engine.getErrorCode()).toBeNull();
    fake.error = { code: 2 };
    expect(engine.getErrorCode()).toBe(2);
  });

  it("emits pause when autoplay is rejected so the UI doesn't claim to be playing", async () => {
    const fake = fakeAudio();
    fake.rejectPlay = true;
    const engine = new AudioEngine(asElement(fake));
    const onPause = vi.fn();
    engine.on("pause", onPause);
    engine.load("a.mp3", true);
    await Promise.resolve();
    await Promise.resolve();
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it("does not emit pause for a play() that was only interrupted by a newer load", async () => {
    const fake = fakeAudio();
    const engine = new AudioEngine(asElement(fake));
    const onPause = vi.fn();
    engine.on("pause", onPause);
    engine.load("a.mp3", true);
    fake.play = () => {
      fake.paused = false;
      return Promise.reject(new DOMException("interrupted", "AbortError"));
    };
    engine.play(); // playing is true by the time the rejection lands
    await Promise.resolve();
    await Promise.resolve();
    expect(onPause).not.toHaveBeenCalled();
  });

  it("keeps the chosen speed across file loads", () => {
    const fake = fakeAudio();
    const engine = new AudioEngine(asElement(fake));
    engine.setRate(1.5);
    expect(fake.playbackRate).toBe(1.5);
    // Browsers reset playbackRate to defaultPlaybackRate when a new src loads.
    expect(fake.defaultPlaybackRate).toBe(1.5);
  });

  it("refreshes the playhead on load, on metadata, and on the final frame at ended", () => {
    const fake = fakeAudio();
    fake.duration = 100;
    fake.currentTime = 40;
    const engine = new AudioEngine(asElement(fake));
    const sink = vi.fn();
    engine.registerSink(sink);

    fake.currentTime = 0;
    fake.duration = Number.NaN;
    engine.load("a.mp3", false);
    expect(sink).toHaveBeenLastCalledWith(0, 0);

    fake.duration = 60;
    fake.listeners.get("loadedmetadata")?.forEach((fn) => {
      fn();
    });
    expect(sink).toHaveBeenLastCalledWith(0, 60);

    fake.currentTime = 60;
    fake.listeners.get("ended")?.forEach((fn) => {
      fn();
    });
    expect(sink).toHaveBeenLastCalledWith(60, 60);
  });

  it("ignores a seek to a non-finite time instead of throwing", () => {
    const fake = fakeAudio();
    fake.duration = 100;
    fake.currentTime = 12;
    const engine = new AudioEngine(asElement(fake));
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      engine.seek(bad);
      expect(fake.currentTime).toBe(12);
    }
  });

  it("moves the playhead on a seek even while paused", () => {
    const fake = fakeAudio();
    fake.duration = 100;
    const engine = new AudioEngine(asElement(fake));
    const sink = vi.fn();
    engine.registerSink(sink);
    engine.seek(30);
    expect(sink).toHaveBeenLastCalledWith(30, 100);
    engine.seekBy(5);
    expect(sink).toHaveBeenLastCalledWith(35, 100);
  });

  it("clamps seeks to the known duration, leaving a tail so a seek can't end the track", () => {
    const fake = fakeAudio();
    fake.duration = 100;
    const engine = new AudioEngine(asElement(fake));
    engine.seek(1000);
    expect(fake.currentTime).toBe(99);
    engine.seekBy(5);
    expect(fake.currentTime).toBe(99);
    engine.seek(-5);
    expect(fake.currentTime).toBe(0);
  });

  describe("scrubbing", () => {
    const playing = () => {
      const fake = fakeAudio();
      fake.duration = 100;
      const engine = new AudioEngine(asElement(fake));
      engine.play();
      return { fake, engine };
    };

    it("pauses silently during a scrub and resumes on release", () => {
      const { fake, engine } = playing();
      const onPause = vi.fn();
      engine.on("pause", onPause);
      engine.beginScrub();
      expect(fake.paused).toBe(true);
      expect(onPause).not.toHaveBeenCalled();
      engine.endScrub();
      expect(fake.paused).toBe(false);
    });

    it("stays paused after a scrub that began paused", () => {
      const fake = fakeAudio();
      fake.duration = 100;
      const engine = new AudioEngine(asElement(fake));
      engine.beginScrub();
      engine.endScrub();
      expect(fake.paused).toBe(true);
    });

    it("a drag to the far end stays short of it and still moves the playhead while held", () => {
      const { fake, engine } = playing();
      const sink = vi.fn();
      engine.registerSink(sink);
      engine.beginScrub();
      engine.seek(100);
      expect(fake.currentTime).toBe(99);
      expect(sink).toHaveBeenLastCalledWith(99, 100);
    });

    it("does not emit ended while scrubbing", () => {
      const { fake, engine } = playing();
      const onEnded = vi.fn();
      engine.on("ended", onEnded);
      engine.beginScrub();
      fake.listeners.get("ended")?.forEach((fn) => {
        fn();
      });
      expect(onEnded).not.toHaveBeenCalled();
    });

    it("ignores a second beginScrub so the original play state survives", () => {
      const { fake, engine } = playing();
      engine.beginScrub();
      engine.beginScrub();
      engine.endScrub();
      expect(fake.paused).toBe(false);
    });
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
