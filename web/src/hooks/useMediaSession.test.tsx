import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeAudio } from "../test/fakeAudio";
import { flush, type Mounted, mountApp } from "../test/render";
import type { FileEntry } from "../types/library";
import { useAudio } from "./useAudio";
import { useMediaSession } from "./useMediaSession";

const file = (path: string): FileEntry => ({
  path,
  name: path.split("/").pop() ?? path,
  duration: 60,
  size: 1,
  mtime: 0,
});
const A = file("pod/a.mp3");
const B = file("pod/b.mp3");

class FakeMetadata {
  constructor(public init: { title: string; artist: string; album: string }) {}
}

type Handler = (d: MediaSessionActionDetails) => void;
const handlers = new Map<string, Handler | null>();
const session = {
  metadata: null as FakeMetadata | null,
  playbackState: "none",
  setActionHandler: vi.fn((action: string, h: Handler | null) => {
    handlers.set(action, h);
  }),
  setPositionState: vi.fn(),
};

let audio: ReturnType<typeof useAudio>;
function Probe() {
  audio = useAudio();
  useMediaSession();
  return null;
}

let mounted: Mounted;
const el = () => FakeAudio.last();
const fire = (action: string, d: Partial<MediaSessionActionDetails> = {}) =>
  flush(() => handlers.get(action)?.({ action, ...d } as MediaSessionActionDetails));

beforeEach(async () => {
  FakeAudio.instances = [];
  handlers.clear();
  session.metadata = null;
  session.playbackState = "none";
  session.setPositionState.mockClear();
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("MediaMetadata", FakeMetadata);
  Object.defineProperty(navigator, "mediaSession", { value: session, configurable: true });
  mounted = await mountApp(<Probe />);
});

afterEach(() => {
  mounted.unmount();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "mediaSession");
  localStorage.clear();
});

describe("useMediaSession", () => {
  it("publishes the playing file and its state", async () => {
    expect(session.metadata).toBeNull();
    await flush(() => audio.playFile(A, [A, B]));
    expect(session.metadata?.init).toEqual({ title: "a.mp3", artist: "pod", album: "Reel" });
    expect(session.playbackState).toBe("playing");
    await flush(() => el().pause());
    expect(session.playbackState).toBe("paused");
  });

  it("reports position for the lock-screen scrubber once the duration is known", async () => {
    await flush(() => audio.playFile(A, [A, B]));
    el().duration = 60;
    el().currentTime = 12;
    await flush(() => el().dispatchEvent(new Event("loadedmetadata")));
    expect(session.setPositionState).toHaveBeenLastCalledWith({
      duration: 60,
      playbackRate: 1,
      position: 12,
    });
  });

  it("hides previous/next when there is nowhere to go", async () => {
    await flush(() => audio.playFile(A, [A]));
    expect(handlers.get("previoustrack")).toBeNull();
    expect(handlers.get("nexttrack")).toBeNull();
    await flush(() => audio.playFile(A, [A, B]));
    expect(handlers.get("nexttrack")).toBeTypeOf("function");
  });

  it("routes the OS controls to the player", async () => {
    await flush(() => audio.playFile(A, [A, B]));
    el().duration = 60;

    await fire("pause");
    expect(el().paused).toBe(true);
    await fire("play");
    expect(el().paused).toBe(false);

    await fire("seekto", { seekTime: 30 });
    expect(el().currentTime).toBe(30);
    await fire("seekforward");
    expect(el().currentTime).toBe(35);
    await fire("seekbackward", { seekOffset: 10 });
    expect(el().currentTime).toBe(25);

    await fire("nexttrack");
    expect(el().src).toBe("/audio/pod%2Fb.mp3");
  });

  it("clears the handlers on unmount", async () => {
    await flush(() => audio.playFile(A, [A, B]));
    mounted.unmount();
    expect(handlers.get("play")).toBeNull();
    expect(handlers.get("nexttrack")).toBeNull();
    mounted = await mountApp(<Probe />);
  });
});
