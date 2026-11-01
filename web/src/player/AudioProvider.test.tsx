import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAudio } from "../hooks/useAudio";
import { useAppState } from "../state/context";
import { FakeAudio } from "../test/fakeAudio";
import { flush, type Mounted, mountApp } from "../test/render";
import type { FileEntry } from "../types/library";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const file = (path: string): FileEntry => ({
  path,
  name: path.split("/").pop() ?? path,
  duration: 60,
  size: 1,
  mtime: 0,
});
const A = file("pod/a.mp3");
const B = file("pod/b.mp3");
const C = file("pod/c.mp3");

type Audio = ReturnType<typeof useAudio>;
type State = ReturnType<typeof useAppState>;
let audio: Audio;
let state: State;

function Probe() {
  audio = useAudio();
  state = useAppState();
  return null;
}

let mounted: Mounted;
const el = () => FakeAudio.last();

beforeEach(async () => {
  FakeAudio.instances = [];
  vi.stubGlobal("Audio", FakeAudio);
  toast.error.mockClear();
  mounted = await mountApp(<Probe />);
});

afterEach(() => {
  mounted.unmount();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("AudioProvider", () => {
  it("plays the chosen file and steps through the queue it came from", async () => {
    // e.g. the user played B from Favorites, whose list isn't the folder's list
    const favorites = [A, C, B];
    await flush(() => audio.playFile(C, favorites));
    expect(el().src).toBe("/audio/pod%2Fc.mp3");
    expect(state.playing).toBe(true);
    expect(audio.canNext).toBe(true); // B follows C in the favorites queue
    expect(audio.canPrev).toBe(true);

    await flush(() => audio.nextFile());
    expect(state.current?.path).toBe("pod/b.mp3");
    expect(audio.canNext).toBe(false);

    await flush(() => audio.prevFile());
    expect(state.current?.path).toBe("pod/c.mp3");
  });

  it("previous rewinds the current file when it has played a while", async () => {
    await flush(() => audio.playFile(B, [A, B, C]));
    el().currentTime = 10;
    el().duration = 60;
    await flush(() => audio.prevFile());
    expect(state.current?.path).toBe("pod/b.mp3");
    expect(el().currentTime).toBe(0);
  });

  it("auto-advances when a file ends, and stops cleanly at the end of the queue", async () => {
    await flush(() => audio.playFile(B, [A, B, C]));
    await flush(() => el().finish());
    expect(state.current?.path).toBe("pod/c.mp3");
    expect(state.playing).toBe(true);

    await flush(() => el().finish());
    expect(state.current?.path).toBe("pod/c.mp3");
    expect(state.playing).toBe(false);
  });

  it("clicking the loaded file toggles play/pause instead of reloading it", async () => {
    await flush(() => audio.playFile(A, [A, B]));
    expect(el().loads).toHaveLength(1);
    await flush(() => audio.playFile(A, [A, B]));
    expect(el().paused).toBe(true);
    expect(state.playing).toBe(false);
    await flush(() => audio.playFile(A, [A, B]));
    expect(el().paused).toBe(false);
    expect(el().loads).toHaveLength(1);
  });

  it("clicking the loaded file from another list adopts that list as the queue", async () => {
    await flush(() => audio.playFile(B, [A, B, C]));
    await flush(() => audio.playFile(B, [B]));
    expect(state.queue.map((f) => f.path)).toEqual(["pod/b.mp3"]);
    expect(audio.canNext).toBe(false);
  });

  it("a blocked autoplay leaves the UI paused, not 'playing'", async () => {
    FakeAudio.last().rejectPlay = true;
    await flush(() => audio.playFile(A, [A, B]));
    expect(state.current?.path).toBe("pod/a.mp3");
    expect(state.playing).toBe(false);
  });

  describe("load errors", () => {
    it("a missing file you picked: say so, stop showing 'playing', stay put", async () => {
      await flush(() => audio.playFile(A, [A, B]));
      await flush(() => el().fail(4));
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("missing"));
      expect(state.playing).toBe(false);
      expect(state.current?.path).toBe("pod/a.mp3");
      expect(state.deadPaths).toEqual(["pod/a.mp3"]);
    });

    it("a dead file reached while playing on is skipped, and the dead one is remembered", async () => {
      await flush(() => audio.playFile(A, [A, B, C]));
      await flush(() => el().finish()); // -> B
      await flush(() => el().fail(3)); // B is corrupt -> skip to C
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("corrupted"));
      expect(state.current?.path).toBe("pod/c.mp3");
      expect(state.playing).toBe(true);
      expect(state.deadPaths).toEqual(["pod/b.mp3"]);
      expect(audio.canPrev).toBe(true); // A, stepping over dead B
    });

    it("running out of playable files after a dead one ends playback", async () => {
      await flush(() => audio.playFile(A, [A, B]));
      await flush(() => el().finish()); // -> B
      await flush(() => el().fail(4));
      expect(state.current?.path).toBe("pod/b.mp3");
      expect(state.playing).toBe(false);
    });

    it("a network error is not the file's fault: no blacklisting, no skipping", async () => {
      await flush(() => audio.playFile(A, [A, B]));
      await flush(() => el().finish()); // -> B, reached by advance
      await flush(() => el().fail(2));
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Network"));
      expect(state.deadPaths).toEqual([]);
      expect(state.current?.path).toBe("pod/b.mp3");
      expect(state.playing).toBe(false);
    });

    it("clicking a failed file again retries it", async () => {
      await flush(() => audio.playFile(A, [A, B]));
      await flush(() => el().fail(4));
      expect(el().loads).toHaveLength(1);
      await flush(() => audio.playFile(A, [A, B]));
      expect(el().loads).toHaveLength(2);
      expect(state.deadPaths).toEqual([]);
      expect(state.playing).toBe(true);
    });
  });

  describe("repeat", () => {
    const setRepeat = async (mode: "queue" | "one") => {
      await flush(() => audio.cycleRepeat());
      if (mode === "one") await flush(() => audio.cycleRepeat());
      expect(state.repeat).toBe(mode);
    };

    it("repeat one restarts the same file when it ends, without reloading it", async () => {
      await flush(() => audio.playFile(B, [A, B, C]));
      await setRepeat("one");
      el().currentTime = 59;
      await flush(() => el().finish());
      expect(state.current?.path).toBe("pod/b.mp3");
      expect(el().loads).toHaveLength(1);
      expect(el().currentTime).toBe(0);
      expect(el().paused).toBe(false);
      expect(state.playing).toBe(true);
    });

    it("repeat one still lets next/previous move to another file", async () => {
      await flush(() => audio.playFile(B, [A, B, C]));
      await setRepeat("one");
      await flush(() => audio.nextFile());
      expect(state.current?.path).toBe("pod/c.mp3");
    });

    it("repeat queue wraps to the start at the end of the queue", async () => {
      await flush(() => audio.playFile(C, [A, B, C]));
      await setRepeat("queue");
      await flush(() => el().finish());
      expect(state.current?.path).toBe("pod/a.mp3");
      expect(state.playing).toBe(true);
    });

    it("repeat queue lets next and previous wrap too, and keeps both enabled", async () => {
      await flush(() => audio.playFile(C, [A, B, C]));
      expect(audio.canNext).toBe(false); // off: end of the line
      await setRepeat("queue");
      expect(audio.canNext).toBe(true);
      await flush(() => audio.nextFile());
      expect(state.current?.path).toBe("pod/a.mp3");
      expect(audio.canPrev).toBe(true);
      await flush(() => audio.prevFile());
      expect(state.current?.path).toBe("pod/c.mp3");
    });

    it("repeat queue skips unplayable files when wrapping", async () => {
      await flush(() => audio.playFile(A, [A, B, C]));
      await flush(() => el().fail(4)); // A is dead
      await flush(() => audio.playFile(C, [A, B, C]));
      await setRepeat("queue");
      await flush(() => el().finish());
      expect(state.current?.path).toBe("pod/b.mp3");
    });

    it("repeat queue with a single file loops it", async () => {
      await flush(() => audio.playFile(A, [A]));
      await setRepeat("queue");
      el().currentTime = 59;
      await flush(() => el().finish());
      expect(state.current?.path).toBe("pod/a.mp3");
      expect(el().loads).toHaveLength(1);
      expect(el().currentTime).toBe(0);
      expect(state.playing).toBe(true);
    });

    it("with repeat off the queue still ends cleanly", async () => {
      await flush(() => audio.playFile(C, [A, B, C]));
      await flush(() => el().finish());
      expect(state.current?.path).toBe("pod/c.mp3");
      expect(state.playing).toBe(false);
    });

    it("remembers the repeat mode for next time", async () => {
      await setRepeat("queue");
      expect(JSON.parse(localStorage.getItem("reel:repeat") ?? "null")).toBe("queue");
    });
  });

  it("keeps the chosen speed and volume on the element", async () => {
    await flush(() => audio.setVolume(40));
    expect(el().volume).toBeCloseTo(0.4);
    await flush(() => audio.cycleSpeed());
    expect(el().playbackRate).toBe(1.25);
    expect(el().defaultPlaybackRate).toBe(1.25);
    await flush(() => audio.toggleMute());
    expect(el().volume).toBe(0);
    await flush(() => audio.toggleMute());
    expect(el().volume).toBeCloseTo(0.4);
  });

  it("persists volume, speed and sort for next time", async () => {
    await flush(() => audio.setVolume(55));
    await flush(() => audio.cycleSpeed());
    expect(JSON.parse(localStorage.getItem("reel:volume") ?? "null")).toBe(55);
    expect(JSON.parse(localStorage.getItem("reel:speed") ?? "null")).toBe(1.25);
  });
});
