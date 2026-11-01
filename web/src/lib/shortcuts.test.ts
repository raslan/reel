import { describe, expect, it } from "vitest";
import { shortcutFor } from "./shortcuts";

type Init = Partial<{
  key: string;
  code: string;
  defaultPrevented: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}>;

const el = (html: string): HTMLElement => {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.firstElementChild as HTMLElement;
};

const press = (init: Init, target: EventTarget | null = document.body) => ({
  key: "",
  code: "",
  defaultPrevented: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...init,
  target,
});

describe("shortcutFor", () => {
  it("maps the global keys when nothing special is focused", () => {
    expect(shortcutFor(press({ code: "Space", key: " " }))).toBe("togglePlay");
    expect(shortcutFor(press({ key: "ArrowRight" }))).toBe("seekForward");
    expect(shortcutFor(press({ key: "ArrowLeft" }))).toBe("seekBack");
    expect(shortcutFor(press({ key: "s" }))).toBe("cycleSpeed");
    expect(shortcutFor(press({ key: "m" }))).toBe("toggleMute");
    expect(shortcutFor(press({ key: "r" }))).toBe("cycleRepeat");
    expect(shortcutFor(press({ key: "Escape" }))).toBe("closeZen");
    expect(shortcutFor(press({ key: "x" }))).toBeNull();
  });

  it("ignores keys with Ctrl/Meta/Alt held, so browser shortcuts still work", () => {
    expect(shortcutFor(press({ key: "s", ctrlKey: true }))).toBeNull();
    expect(shortcutFor(press({ key: "s", metaKey: true }))).toBeNull();
    expect(shortcutFor(press({ key: "ArrowLeft", altKey: true }))).toBeNull(); // history back
  });

  it("ignores events something else already handled", () => {
    expect(shortcutFor(press({ key: "ArrowRight", defaultPrevented: true }))).toBeNull();
  });

  it("never fires while typing", () => {
    for (const html of ["<input />", "<textarea></textarea>", "<select></select>"]) {
      expect(shortcutFor(press({ key: "s" }, el(html)))).toBeNull();
      expect(shortcutFor(press({ code: "Space" }, el(html)))).toBeNull();
    }
    const editable = el('<div contenteditable="true"></div>');
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect(shortcutFor(press({ key: "s" }, editable))).toBeNull();
  });

  it("leaves Space to a focused button or link, which activates natively", () => {
    expect(shortcutFor(press({ code: "Space" }, el("<button>x</button>")))).toBeNull();
    const inner = el("<button><span>icon</span></button>").firstElementChild;
    expect(shortcutFor(press({ code: "Space" }, inner))).toBeNull();
    expect(shortcutFor(press({ code: "Space" }, el('<a href="#">x</a>')))).toBeNull();
  });

  it("leaves arrows to a focused slider, which handles them itself", () => {
    const slider = el('<div role="slider" tabindex="0"></div>');
    expect(shortcutFor(press({ key: "ArrowRight" }, slider))).toBeNull();
    expect(shortcutFor(press({ key: "ArrowLeft" }, slider))).toBeNull();
    expect(shortcutFor(press({ code: "Space" }, slider))).toBeNull();
    // other global keys still work from a slider
    expect(shortcutFor(press({ key: "s" }, slider))).toBe("cycleSpeed");
  });

  it("still seeks with the arrows from a focused button", () => {
    expect(shortcutFor(press({ key: "ArrowRight" }, el("<button>x</button>")))).toBe("seekForward");
  });
});
