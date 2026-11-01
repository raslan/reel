import type { RepeatMode, SortKey, SortPref } from "../types/player";
import { loadJSON } from "./storage";

export const VOLUME_KEY = "reel:volume";
export const SPEED_KEY = "reel:speed";
export const SORT_KEY = "reel:sort";
export const REPEAT_KEY = "reel:repeat";

/** Supported playback speeds, in cycle order. */
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/** Repeat modes, in cycle order. */
export const REPEAT_MODES = ["off", "queue", "one"] as const satisfies readonly RepeatMode[];

export interface Prefs {
  /** 0..100 */
  volume: number;
  speed: number;
  sort: SortPref;
  repeat: RepeatMode;
}

export const DEFAULT_SORT: SortPref = { key: "name", dir: 1 };

const SORT_KEYS = ["name", "duration", "modified", "size"] as const satisfies readonly SortKey[];

function loadSort(raw: Partial<SortPref> | null): SortPref {
  if (raw === null || typeof raw !== "object") return DEFAULT_SORT;
  const key = SORT_KEYS.find((k) => k === raw.key);
  return key !== undefined && (raw.dir === 1 || raw.dir === -1)
    ? { key, dir: raw.dir }
    : DEFAULT_SORT;
}

/** Stored values are untrusted (hand-edited, older versions, corrupt): validate each one. */
export function loadPrefs(): Prefs {
  const volume = loadJSON<unknown>(VOLUME_KEY, null);
  const speed = loadJSON<unknown>(SPEED_KEY, null);
  const sort = loadJSON<unknown>(SORT_KEY, null) as Partial<SortPref> | null;
  const repeat = loadJSON<unknown>(REPEAT_KEY, null);
  return {
    repeat: REPEAT_MODES.find((m) => m === repeat) ?? "off",
    volume:
      typeof volume === "number" && Number.isFinite(volume)
        ? Math.min(100, Math.max(0, Math.round(volume)))
        : 100,
    speed: SPEEDS.find((s) => s === speed) ?? 1,
    sort: loadSort(sort),
  };
}
