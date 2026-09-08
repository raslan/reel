import { createContext, type Dispatch, type ReactNode, useContext, useReducer } from "react";
import { loadJSON } from "../lib/storage";
import { type Action, type AppState, appReducer, initialState } from "./reducer";

const StateCtx = createContext<AppState | null>(null);
const DispatchCtx = createContext<Dispatch<Action> | null>(null);

export const VOLUME_KEY = "reel:volume";

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, undefined, () =>
    initialState(loadJSON<number>(VOLUME_KEY, 100)),
  );
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
