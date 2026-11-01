import { createContext, type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { AudioEngine } from "../lib/audio/engine";
import { describeMediaError } from "../lib/audio/mediaError";
import { parentFolder } from "../lib/path";
import { stepIn, stepWrapping } from "../lib/playchain";
import { useAppDispatch, useAppState } from "../state/context";
import type { FileEntry } from "../types/library";

export interface AudioApi {
  engine: AudioEngine;
  togglePlay: () => void;
  /**
   * Play `file`; next/prev step through `queue` (the list it was played from, in display order).
   * Playing the file that's already loaded toggles play/pause instead of restarting it.
   */
  playFile: (file: FileEntry, queue: FileEntry[]) => void;
  nextFile: () => void;
  prevFile: () => void;
  seekBy: (d: number) => void;
  cycleSpeed: () => void;
  /** off → repeat queue → repeat one → off. */
  cycleRepeat: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  canPrev: boolean;
  canNext: boolean;
}

export const AudioCtx = createContext<AudioApi | null>(null);

const toCurrent = (f: FileEntry) => ({
  path: f.path,
  name: f.name,
  folderPath: parentFolder(f.path),
  duration: f.duration,
});

/** Restart-from-top threshold for "previous": past this, prev rewinds instead of changing file. */
const PREV_REWIND_AFTER_S = 3;

export function AudioProvider({ children }: { children: ReactNode }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const engineRef = useRef<AudioEngine | null>(null);
  if (engineRef.current === null) engineRef.current = new AudioEngine();
  const engine = engineRef.current;
  const stateRef = useRef(state);
  stateRef.current = state;
  const loadedPath = useRef<string | null>(null);
  /** True when the loaded file was reached by next/auto-advance (so a dead one should be skipped, not stop playback). */
  const reachedByAdvance = useRef(false);

  const deadPaths = useMemo(() => new Set(state.deadPaths), [state.deadPaths]);
  const { canPrev, canNext } = useMemo(() => {
    if (state.current === null) return { canPrev: false, canNext: false };
    // Repeating the queue means there is always somewhere to go while anything is playable.
    const step = state.repeat === "queue" ? stepWrapping : stepIn;
    return {
      canPrev: step(state.queue, state.current.path, -1, deadPaths) !== null,
      canNext: step(state.queue, state.current.path, 1, deadPaths) !== null,
    };
  }, [state.current, state.queue, state.repeat, deadPaths]);

  // Load a new file whenever the current file changes.
  useEffect(() => {
    if (state.current === null) {
      loadedPath.current = null;
      return;
    }
    if (loadedPath.current !== state.current.path) {
      loadedPath.current = state.current.path;
      engine.load(state.current.path, true);
    }
  }, [state.current, engine]);

  // Transport: speed and volume flow state -> engine.
  useEffect(() => {
    engine.setRate(state.speed);
  }, [state.speed, engine]);
  useEffect(() => {
    engine.setVolume(state.volume / 100);
  }, [state.volume, engine]);

  // Step through the queue the current file was played from, skipping dead files
  // (and wrapping around the ends when repeating the queue).
  // `alsoDead` is a path that just failed and isn't in state yet.
  const advance = useCallback(
    (dir: 1 | -1, alsoDead?: string): boolean => {
      const { current: cur, queue, deadPaths: dead, repeat } = stateRef.current;
      if (cur === null) return false;
      const skip = new Set(dead);
      if (alsoDead !== undefined) skip.add(alsoDead);
      const next = (repeat === "queue" ? stepWrapping : stepIn)(queue, cur.path, dir, skip);
      if (next === null) return false;
      reachedByAdvance.current = true;
      if (next.path === cur.path) {
        // Wrapped onto the same file (a one-file queue): it's already loaded, so just restart it.
        engine.seek(0);
        engine.play();
      } else {
        dispatch({ type: "playFile", file: toCurrent(next), queue });
      }
      return true;
    },
    [dispatch, engine],
  );
  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  // Engine events -> state.
  useEffect(() => {
    const offs = [
      engine.on("play", () => dispatch({ type: "setPlaying", playing: true })),
      engine.on("pause", () => dispatch({ type: "setPlaying", playing: false })),
      engine.on("duration", () => {
        const d = engine.getDuration();
        if (d > 0) dispatch({ type: "setDuration", duration: d });
      }),
      engine.on("error", (path) => {
        const cur = stateRef.current.current;
        if (path === undefined || cur === null || cur.path !== path) return;
        const failure = describeMediaError(cur.name, engine.getErrorCode());
        toast.error(failure.message);
        dispatch({ type: "setPlaying", playing: false });
        if (!failure.dead) return;
        dispatch({ type: "markDead", path });
        // During continuous playback keep going; if the user picked this file, leave them to choose.
        if (reachedByAdvance.current) advanceRef.current(1, path);
      }),
      engine.on("ended", () => {
        if (stateRef.current.repeat === "one") {
          engine.seek(0);
          engine.play();
          return;
        }
        if (!advanceRef.current(1)) dispatch({ type: "setPlaying", playing: false });
      }),
    ];
    return () => {
      offs.forEach((off) => {
        off();
      });
    };
  }, [engine, dispatch]);

  const api = useMemo<AudioApi>(
    () => ({
      engine,
      togglePlay: () => {
        if (stateRef.current.current === null) return;
        engine.toggle();
      },
      playFile: (file, queue) => {
        const { current: cur, deadPaths: dead } = stateRef.current;
        if (cur?.path === file.path) {
          if (dead.includes(file.path)) {
            // Retrying a file that failed: the effect won't reload an unchanged path.
            dispatch({ type: "playFile", file: toCurrent(file), queue });
            engine.load(file.path, true);
          } else {
            // Same file, maybe from a different list: next/prev should follow the one just used.
            dispatch({ type: "setQueue", queue });
            engine.toggle();
          }
          return;
        }
        reachedByAdvance.current = false;
        dispatch({ type: "playFile", file: toCurrent(file), queue });
      },
      nextFile: () => {
        advance(1);
      },
      prevFile: () => {
        if (engine.getPosition() > PREV_REWIND_AFTER_S) {
          engine.seek(0);
          return;
        }
        advance(-1);
      },
      seekBy: (d) => engine.seekBy(d),
      cycleSpeed: () => dispatch({ type: "cycleSpeed" }),
      cycleRepeat: () => dispatch({ type: "cycleRepeat" }),
      setVolume: (v) => dispatch({ type: "setVolume", volume: v }),
      toggleMute: () => dispatch({ type: "toggleMute" }),
      canPrev,
      canNext,
    }),
    [engine, dispatch, advance, canPrev, canNext],
  );

  useEffect(
    () => () => {
      engine.dispose();
      loadedPath.current = null;
    },
    [engine],
  );

  return <AudioCtx.Provider value={api}>{children}</AudioCtx.Provider>;
}
