import type { Screen } from "../state/reducer";

/** The part of app state that lives in the URL hash, so Back/Forward, refresh and bookmarks work. */
export interface Route {
  screen: Screen;
  /** '' = library root. Only meaningful on the library screen. */
  folderPath: string;
}

const SCREENS: readonly Screen[] = ["library", "search", "favorites", "settings"];

const isScreen = (s: string | undefined): s is Screen => SCREENS.some((x) => x === s);

/** `#/library/Podcasts/Ep%201` → { screen: "library", folderPath: "Podcasts/Ep 1" }. Anything unrecognised → the library root. */
export function parseHash(hash: string): Route {
  const [head, ...rest] = hash.replace(/^#\/?/, "").split("/");
  if (!isScreen(head)) return { screen: "library", folderPath: "" };
  const screen = head;
  if (screen !== "library") return { screen, folderPath: "" };
  const segments: string[] = [];
  for (const raw of rest) {
    if (raw === "") continue;
    let seg: string;
    try {
      seg = decodeURIComponent(raw);
    } catch {
      return { screen, folderPath: "" };
    }
    // Same rule the server applies: plain segments only.
    if (seg === "." || seg === ".." || seg.includes("/")) return { screen, folderPath: "" };
    segments.push(seg);
  }
  return { screen, folderPath: segments.join("/") };
}

export function formatHash({ screen, folderPath }: Route): string {
  if (screen !== "library" || folderPath === "") return `#/${screen}`;
  return `#/library/${folderPath.split("/").map(encodeURIComponent).join("/")}`;
}
