import type { CurrentFile, SortPref } from "../types/player";

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
  playing: boolean;
  /** 0.5, 0.75, 1, 1.25, 1.5, 2 */
  speed: number;
  /** 0..100 */
  volume: number;
  sort: SortPref;
  zen: boolean;
  /** Files that failed to load this session; skipped by next/prev. */
  deadPaths: string[];
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

const defaultSort: SortPref = { key: "name", dir: 1 };

export function initialState(volume = 100): AppState {
  return {
    screen: "library",
    folderPath: "",
    folderQuery: "",
    searchQuery: "",
    current: null,
    playing: false,
    speed: 1,
    volume,
    sort: defaultSort,
    zen: false,
    deadPaths: [],
  };
}

export type Action =
  | { type: "setScreen"; screen: Screen }
  | { type: "setFolderPath"; path: string }
  | { type: "setFolderQuery"; query: string }
  | { type: "setSearchQuery"; query: string }
  | { type: "playFile"; file: CurrentFile }
  | { type: "setPlaying"; playing: boolean }
  | { type: "setDuration"; duration: number }
  | { type: "cycleSpeed" }
  | { type: "setVolume"; volume: number }
  | { type: "setSort"; sort: SortPref }
  | { type: "openZen" }
  | { type: "closeZen" }
  | { type: "toggleZen" }
  | { type: "markDead"; path: string };

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "setScreen":
      return state.screen === action.screen ? state : { ...state, screen: action.screen };
    case "setFolderPath":
      return state.folderPath === action.path
        ? state
        : { ...state, folderPath: action.path, folderQuery: "", screen: "library" };
    case "setFolderQuery":
      return state.folderQuery === action.query ? state : { ...state, folderQuery: action.query };
    case "setSearchQuery":
      return state.searchQuery === action.query ? state : { ...state, searchQuery: action.query };
    case "playFile":
      return {
        ...state,
        current: action.file,
        playing: true,
        screen: state.screen === "settings" ? "library" : state.screen,
      };
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
    case "setVolume": {
      const v = Math.min(100, Math.max(0, Math.round(action.volume)));
      return state.volume === v ? state : { ...state, volume: v };
    }
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
  }
}
