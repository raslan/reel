import { DEFAULT_SORT, type Prefs, REPEAT_MODES, SPEEDS } from "../lib/prefs";
import type { FileEntry } from "../types/library";
import type { CurrentFile, RepeatMode, SortPref } from "../types/player";

export type Screen = "library" | "search" | "favorites" | "settings";

export interface AppState {
  screen: Screen;
  /** '' = library root (all libraries). */
  folderPath: string;
  /** In-folder search text (Library screen). */
  folderQuery: string;
  /** Global search text (Search screen). */
  searchQuery: string;
  current: CurrentFile | null;
  /**
   * Snapshot of the list the current file was played from (folder, search
   * results, favorites), in display order. Next/prev step through this, so
   * later edits to the source list don't change what's next.
   */
  queue: FileEntry[];
  playing: boolean;
  /** One of SPEEDS. */
  speed: number;
  repeat: RepeatMode;
  /** 0..100 */
  volume: number;
  /** Volume to restore on unmute; null unless currently muted via toggleMute. */
  mutedFrom: number | null;
  sort: SortPref;
  zen: boolean;
  /** Files that failed to load; skipped by next/prev until the library changes or they're played explicitly. */
  deadPaths: string[];
}

/** Volume restored by unmuting when nothing better is known (e.g. after a reload at volume 0). */
const UNMUTE_FALLBACK = 50;

export function initialState(
  prefs: Partial<Prefs> = {},
  route: { screen: Screen; folderPath: string } = { screen: "library", folderPath: "" },
): AppState {
  return {
    screen: route.screen,
    folderPath: route.folderPath,
    folderQuery: "",
    searchQuery: "",
    current: null,
    queue: [],
    playing: false,
    speed: prefs.speed ?? 1,
    repeat: prefs.repeat ?? "off",
    volume: prefs.volume ?? 100,
    mutedFrom: null,
    sort: prefs.sort ?? DEFAULT_SORT,
    zen: false,
    deadPaths: [],
  };
}

export type Action =
  | { type: "setScreen"; screen: Screen }
  | { type: "setFolderPath"; path: string }
  /** The URL changed (Back/Forward, edited hash): adopt its screen and folder. */
  | { type: "navigate"; screen: Screen; folderPath: string }
  | { type: "setFolderQuery"; query: string }
  | { type: "setSearchQuery"; query: string }
  | { type: "playFile"; file: CurrentFile; queue: FileEntry[] }
  | { type: "setQueue"; queue: FileEntry[] }
  | { type: "setPlaying"; playing: boolean }
  | { type: "setDuration"; duration: number }
  | { type: "cycleSpeed" }
  | { type: "cycleRepeat" }
  | { type: "setVolume"; volume: number }
  | { type: "toggleMute" }
  | { type: "setSort"; sort: SortPref }
  | { type: "openZen" }
  | { type: "closeZen" }
  | { type: "toggleZen" }
  | { type: "markDead"; path: string }
  | { type: "clearDead" };

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "setScreen":
      return state.screen === action.screen ? state : { ...state, screen: action.screen };
    case "setFolderPath":
      return state.folderPath === action.path
        ? state
        : { ...state, folderPath: action.path, folderQuery: "", screen: "library" };
    case "navigate":
      if (state.screen === action.screen && state.folderPath === action.folderPath) return state;
      return {
        ...state,
        screen: action.screen,
        folderPath: action.folderPath,
        folderQuery: state.folderPath === action.folderPath ? state.folderQuery : "",
      };
    case "setFolderQuery":
      return state.folderQuery === action.query ? state : { ...state, folderQuery: action.query };
    case "setSearchQuery":
      return state.searchQuery === action.query ? state : { ...state, searchQuery: action.query };
    case "playFile":
      return {
        ...state,
        current: action.file,
        queue: action.queue,
        playing: true,
        // Choosing a file is an explicit retry of it, even if it failed before.
        deadPaths: state.deadPaths.includes(action.file.path)
          ? state.deadPaths.filter((p) => p !== action.file.path)
          : state.deadPaths,
        screen: state.screen === "settings" ? "library" : state.screen,
      };
    case "setQueue":
      return { ...state, queue: action.queue };
    case "setPlaying":
      return state.playing === action.playing ? state : { ...state, playing: action.playing };
    case "setDuration":
      if (state.current === null || state.current.duration === action.duration) return state;
      return { ...state, current: { ...state.current, duration: action.duration } };
    case "cycleSpeed": {
      const i = SPEEDS.indexOf(state.speed as (typeof SPEEDS)[number]);
      const next = SPEEDS[(i + 1) % SPEEDS.length];
      return next === undefined ? state : { ...state, speed: next };
    }
    case "cycleRepeat": {
      const next = REPEAT_MODES[(REPEAT_MODES.indexOf(state.repeat) + 1) % REPEAT_MODES.length];
      return next === undefined ? state : { ...state, repeat: next };
    }
    case "setVolume": {
      const v = Math.min(100, Math.max(0, Math.round(action.volume)));
      return state.volume === v && state.mutedFrom === null
        ? state
        : { ...state, volume: v, mutedFrom: null };
    }
    case "toggleMute":
      return state.volume > 0
        ? { ...state, volume: 0, mutedFrom: state.volume }
        : { ...state, volume: state.mutedFrom ?? UNMUTE_FALLBACK, mutedFrom: null };
    case "setSort":
      return state.sort.key === action.sort.key && state.sort.dir === action.sort.dir
        ? state
        : { ...state, sort: action.sort };
    case "openZen":
      return state.zen ? state : { ...state, zen: true };
    case "closeZen":
      return state.zen ? { ...state, zen: false } : state;
    case "toggleZen":
      return { ...state, zen: !state.zen };
    case "markDead":
      return state.deadPaths.includes(action.path)
        ? state
        : { ...state, deadPaths: [...state.deadPaths, action.path] };
    case "clearDead":
      return state.deadPaths.length === 0 ? state : { ...state, deadPaths: [] };
  }
}
