import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";
import { FakeAudio } from "./test/fakeAudio";
import { flush, type Mounted, mountApp, until } from "./test/render";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

/** Records the SSE connection so tests can push server events. */
class FakeEventSource {
  static last: FakeEventSource | null = null;
  listeners = new Map<string, (e: MessageEvent) => void>();
  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(name: string, fn: (e: MessageEvent) => void) {
    this.listeners.set(name, fn);
  }
  removeEventListener(name: string) {
    this.listeners.delete(name);
  }
  close() {}
  emit(name: string, data: unknown) {
    this.listeners.get(name)?.(new MessageEvent(name, { data: JSON.stringify(data) }));
  }
}

const loose = {
  name: "loose.mp3",
  path: "loose.mp3",
  duration: 65,
  size: 1,
  mtime: 0,
};
const intro = {
  name: "intro.mp3",
  path: "Podcasts/intro.mp3",
  duration: 3725,
  size: 1,
  mtime: 0,
};

let fetched: string[];
let rescanStatus: unknown;

function route(url: string): unknown {
  const u = new URL(url, "http://localhost");
  switch (u.pathname) {
    case "/api/list":
      return u.searchParams.get("path") === "Podcasts"
        ? { folders: [], files: [intro] }
        : { folders: [{ name: "Podcasts", path: "Podcasts" }], files: [loose] };
    case "/api/favorites":
      return { files: [intro] };
    case "/api/search":
      return { files: [loose], total: 1 };
    case "/api/rescan":
      return rescanStatus;
    default:
      throw new Error(`unrouted ${url}`);
  }
}

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      fetched.push(input);
      if (input.startsWith("/api/peaks")) return new Response("{}", { status: 202 });
      return new Response(JSON.stringify(route(input)), {
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

/** jsdom has no layout: give scroll containers a size so the virtual list renders rows. */
function stubLayout() {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600 };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    ...rect,
    toJSON: () => rect,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: 800 });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
}

let mounted: Mounted;
const q = <T extends Element>(sel: string) => mounted.container.querySelector<T>(sel);
const text = () => mounted.container.textContent ?? "";
const goto = (label: string) =>
  flush(() => {
    const nav = [...mounted.container.querySelectorAll<HTMLButtonElement>("aside nav button")];
    nav.find((b) => b.textContent?.includes(label))?.click();
  });

beforeEach(async () => {
  fetched = [];
  rescanStatus = { running: false, last: null };
  FakeAudio.instances = [];
  localStorage.clear();
  window.history.replaceState(null, "", "#"); // routes live in the URL, which outlives a test
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("EventSource", FakeEventSource);
  stubFetch();
  stubLayout();
  mounted = await mountApp(<App />);
  await flush();
});

afterEach(() => {
  mounted.unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("App smoke", () => {
  it("shows the library root with its folders and files, and opens a folder", async () => {
    expect(text()).toContain("Podcasts");
    expect(text()).toContain("loose.mp3");
    expect(text()).toContain("1 folders · 1 files");

    await flush(() => {
      [...mounted.container.querySelectorAll<HTMLButtonElement>("button")]
        .find((b) => b.textContent === "Podcasts")
        ?.click();
    });
    expect(fetched).toContain("/api/list?path=Podcasts");
    await until(() => text().includes("intro.mp3"));
  });

  describe("URL", () => {
    const openPodcasts = () =>
      flush(() => {
        [...mounted.container.querySelectorAll<HTMLButtonElement>("button")]
          .find((b) => b.textContent === "Podcasts")
          ?.click();
      });
    const goBackTo = (hash: string) =>
      flush(() => {
        window.history.replaceState(null, "", hash);
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      });

    it("normalises an empty URL and reflects the screen and folder as you move", async () => {
      expect(window.location.hash).toBe("#/library");
      await openPodcasts();
      expect(window.location.hash).toBe("#/library/Podcasts");
      await goto("Favorites");
      expect(window.location.hash).toBe("#/favorites");
    });

    it("follows the URL when it changes (Back, Forward, an edited hash)", async () => {
      await openPodcasts();
      await until(() => text().includes("intro.mp3"));
      await goBackTo("#/library");
      expect(text()).toContain("loose.mp3");
      await goBackTo("#/settings");
      expect(text()).toContain("Rescan");
      expect(window.location.hash).toBe("#/settings"); // adopting the URL doesn't push another entry
    });

    it("opens straight to the folder named in the URL on load", async () => {
      mounted.unmount();
      window.history.replaceState(null, "", "#/library/Podcasts");
      mounted = await mountApp(<App />);
      await until(() => text().includes("intro.mp3"));
      expect(fetched).toContain("/api/list?path=Podcasts");
      expect(window.location.hash).toBe("#/library/Podcasts");
    });

    it("tapping Library while inside a folder climbs back to the root", async () => {
      await openPodcasts();
      await until(() => text().includes("intro.mp3"));
      await goto("Library");
      expect(window.location.hash).toBe("#/library");
      expect(text()).toContain("loose.mp3");
      await openPodcasts();
      await goto("Favorites");
      await goto("Library"); // coming from another tab keeps your place
      expect(window.location.hash).toBe("#/library/Podcasts");
    });

    it("each move is a history entry, so Back has somewhere to go", async () => {
      const before = window.history.length;
      await openPodcasts();
      await goto("Favorites");
      expect(window.history.length).toBe(before + 2);
    });
  });

  it("favorites show real durations", async () => {
    await goto("Favorites");
    await until(() => text().includes("intro.mp3"));
    expect(text()).toContain("62:05"); // 3725s — not the "–" placeholder
    expect(text()).toContain("1 starred");
  });

  it("global search doesn't hit the server until something is typed", async () => {
    await goto("Search");
    expect(text()).toContain("Search your library");
    expect(fetched.some((u) => u.startsWith("/api/search"))).toBe(false);
  });

  it("searching queries the server after the typing pause and shows the results", async () => {
    await goto("Search");
    const input = q<HTMLInputElement>('input[type="text"]');
    if (input === null) throw new Error("search input missing");
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    await flush(() => {
      setValue?.call(input, "loo");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(fetched.some((u) => u.startsWith("/api/search"))).toBe(false); // still inside the debounce
    await until(() => fetched.includes("/api/search?q=loo"));
    await until(() => text().includes("1 match"));
    expect(text()).toContain("loose.mp3");
  });

  it("settings reflect a running rescan and the last result from the server", async () => {
    rescanStatus = { running: true, last: null };
    await goto("Settings");
    await until(() => text().includes("Scanning…"));
    expect(q<HTMLButtonElement>("button:has(svg.animate-spin)")?.disabled).toBe(true);

    rescanStatus = {
      running: false,
      last: { ok: true, finishedAt: Date.now(), added: 2, removed: 0, changed: 1 },
    };
    await flush(() => FakeEventSource.last?.emit("rescan-finished", { added: 2, changed: 1 }));
    await until(() => text().includes("2 added, 1 changed"));
    expect(text()).not.toContain("Scanning…");
  });

  describe("bottom bar", () => {
    const bar = () => q<HTMLElement>("main + div"); // the bar sits right after <main>
    const click = (sel: string) => flush(() => q<HTMLButtonElement>(sel)?.click());

    it("says nothing is playing, with the controls disabled, until a file is chosen", () => {
      expect(bar()?.textContent).toContain("Nothing playing");
      expect(q<HTMLButtonElement>('button[aria-label="Play"]')?.disabled).toBe(true);
      expect(q<HTMLButtonElement>('button[aria-label="Open zen player"]')?.disabled).toBe(true);
    });

    it("has no mini player chip: one title, one waveform strip, times at its ends", async () => {
      await click('button[aria-label="Play loose.mp3"]');
      expect(bar()?.querySelectorAll('[role="slider"][aria-label="Seek"]')).toHaveLength(1);
      expect(bar()?.querySelectorAll(".wave")).toHaveLength(1);
      expect(bar()?.textContent).toContain("loose.mp3");
      expect(bar()?.textContent).toContain("1:05"); // the duration from the library listing
      expect(bar()?.textContent).toContain("0:00"); // elapsed time
    });

    it("has the full transport: previous, −5s, play/pause, +5s, next", async () => {
      await click('button[aria-label="Play loose.mp3"]');
      for (const label of ["Previous", "Back 5 seconds", "Pause", "Forward 5 seconds", "Next"]) {
        expect(bar()?.querySelector(`button[aria-label="${label}"]`), label).not.toBeNull();
      }
    });

    it("opens the zen player from the title or the expand button", async () => {
      await click('button[aria-label="Play loose.mp3"]');
      const zen = () => q('button[aria-label="Close"]');
      expect(zen()).toBeNull();
      await click('main + div button[title="loose.mp3"]'); // the title (its tooltip is the full name)
      expect(zen()).not.toBeNull();
      await click('button[aria-label="Close"]');
      expect(zen()).toBeNull();
      await click('button[aria-label="Open zen player"]'); // the expand button
      expect(zen()).not.toBeNull();
    });

    it("the repeat button cycles off → whole list → this file, and R does the same", async () => {
      const label = () =>
        bar()?.querySelector('button[aria-label^="Repeat"]')?.getAttribute("aria-label");
      expect(label()).toBe("Repeat: off");
      await click('main + div button[aria-label^="Repeat"]');
      expect(label()).toBe("Repeat: whole list");
      await flush(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "r", bubbles: true }));
      });
      expect(label()).toBe("Repeat: this file");
      await click('main + div button[aria-label^="Repeat"]');
      expect(label()).toBe("Repeat: off");
    });
  });

  it("the deck status (zen player) follows playing → paused → standby at 0:00", async () => {
    await flush(() => q<HTMLButtonElement>('button[aria-label="Play loose.mp3"]')?.click());
    await flush(() => q<HTMLButtonElement>('button[aria-label="Open zen player"]')?.click());
    const status = () => q<HTMLElement>("div.fixed [class*='tracking-[.18em]']")?.textContent;
    const audio = FakeAudio.last();
    expect(status()).toBe("PLAYING");

    audio.currentTime = 12;
    await flush(() => audio.pause());
    expect(status()).toBe("PAUSED");

    audio.currentTime = 0; // e.g. "previous" rewound a paused file
    await flush(() => audio.dispatchEvent(new Event("seeked")));
    expect(status()).toBe("STANDBY");
  });

  describe("keyboard", () => {
    async function playLoose() {
      await flush(() => q<HTMLButtonElement>('button[aria-label="Play loose.mp3"]')?.click());
      return FakeAudio.last();
    }
    const press = (key: string, target: Element | Window = window) =>
      act(async () => {
        target.dispatchEvent(
          new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
        );
      });

    it("arrow keys seek 5s from the page", async () => {
      const audio = await playLoose();
      audio.duration = 600;
      await press("ArrowRight");
      expect(audio.currentTime).toBe(5);
    });

    it("arrow keys on the focused seek bar move 5s once, not twice", async () => {
      const audio = await playLoose();
      audio.duration = 600;
      const seek = q<HTMLElement>('[role="slider"][aria-label="Seek"]');
      if (seek === null) throw new Error("seek bar missing");
      await press("ArrowRight", seek);
      expect(audio.currentTime).toBe(5);
    });

    it("typing in the search box doesn't trigger shortcuts", async () => {
      const audio = await playLoose();
      await goto("Search");
      const input = q<HTMLInputElement>('input[type="text"]');
      if (input === null) throw new Error("search input missing");
      input.focus();
      await press("s", input);
      await press("m", input);
      expect(audio.volume).toBe(1);
      expect(audio.playbackRate).toBe(1);
    });

    it("m mutes and unmutes", async () => {
      const audio = await playLoose();
      await press("m");
      expect(audio.volume).toBe(0);
      await press("m");
      expect(audio.volume).toBe(1);
    });
  });
});
