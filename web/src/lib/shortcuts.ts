export type Shortcut =
  | "togglePlay"
  | "seekBack"
  | "seekForward"
  | "cycleSpeed"
  | "cycleRepeat"
  | "toggleMute"
  | "closeZen";

interface KeyEventLike {
  key: string;
  code: string;
  defaultPrevented: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}

const TEXT_INPUT = "input, textarea, select";
/** Elements that already do something with Space. */
const SPACE_NATIVE = 'button, a[href], [role="slider"]';

/**
 * Which app-wide shortcut (if any) a keydown means. Pure so the rules about
 * *not* firing — typing, modifiers, widgets that own the key — are testable.
 */
export function shortcutFor(e: KeyEventLike): Shortcut | null {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return null;
  const t = e.target instanceof Element ? e.target : null;
  if (t !== null) {
    if (t.closest(TEXT_INPUT) !== null) return null;
    if (t instanceof HTMLElement && t.isContentEditable) return null;
  }
  switch (e.key) {
    case "ArrowRight":
    case "ArrowLeft":
      // A focused slider (seek bar, volume) moves itself; don't also seek.
      if (t?.closest('[role="slider"]')) return null;
      return e.key === "ArrowRight" ? "seekForward" : "seekBack";
    case "Escape":
      return "closeZen";
    case "s":
      return "cycleSpeed";
    case "m":
      return "toggleMute";
    case "r":
      return "cycleRepeat";
  }
  if (e.code === "Space") return t?.closest(SPACE_NATIVE) ? null : "togglePlay";
  return null;
}
