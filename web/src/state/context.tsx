import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useEffect,
  useReducer,
} from "react";
import { loadPrefs, REPEAT_KEY, SORT_KEY, SPEED_KEY, VOLUME_KEY } from "../lib/prefs";
import { parseHash } from "../lib/route";
import { saveJSON } from "../lib/storage";
import { type Action, type AppState, appReducer, initialState } from "./reducer";

const StateCtx = createContext<AppState | null>(null);
const DispatchCtx = createContext<Dispatch<Action> | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, undefined, () =>
    initialState(loadPrefs(), parseHash(window.location.hash)),
  );
  // Preferences persist across reloads; state -> storage is the only direction.
  useEffect(() => saveJSON(VOLUME_KEY, state.volume), [state.volume]);
  useEffect(() => saveJSON(SPEED_KEY, state.speed), [state.speed]);
  useEffect(() => saveJSON(SORT_KEY, state.sort), [state.sort]);
  useEffect(() => saveJSON(REPEAT_KEY, state.repeat), [state.repeat]);
  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>{children}</DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

export function useAppState(): AppState {
  const ctx = useContext(StateCtx);
  if (ctx === null) throw new Error("useAppState outside AppProvider");
  return ctx;
}

export function useAppDispatch(): Dispatch<Action> {
  const ctx = useContext(DispatchCtx);
  if (ctx === null) throw new Error("useAppDispatch outside AppProvider");
  return ctx;
}
