import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeAudio } from "../test/fakeAudio";
import { type Mounted, mountApp } from "../test/render";
import type { FileEntry } from "../types/library";
import { FileRow } from "./FileRow";

const file: FileEntry = {
  name: "0001.mp3",
  path: "Rec/0001.mp3",
  duration: 60,
  size: 1,
  mtime: 0,
};

let mounted: Mounted;

afterEach(() => {
  mounted.unmount();
  vi.unstubAllGlobals();
});

describe("FileRow", () => {
  it("shows the file name, and the path only when asked", async () => {
    vi.stubGlobal("Audio", FakeAudio);
    const props = {
      file,
      onPlay: vi.fn(),
      onStar: vi.fn(),
      isCurrent: false,
      isPlaying: false,
      isFav: false,
    };
    mounted = await mountApp(<FileRow {...props} />);
    expect(mounted.container.textContent).toContain("0001.mp3");
    expect(mounted.container.textContent).not.toContain("Rec/0001.mp3");
    expect(mounted.container.querySelector("[aria-label='Play 0001.mp3']")).not.toBeNull();
    mounted.unmount();
    mounted = await mountApp(<FileRow {...props} showPath />);
    expect(mounted.container.textContent).toContain("Rec/0001.mp3");
  });
});
