import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { errorMessage, listFolder } from "../lib/api";
import { AudioEngine } from "../lib/audio/engine";
import { folderKey } from "../lib/keys";
import { parentFolder } from "../lib/path";
import { stepIn } from "../lib/playchain";
import { sortFiles } from "../lib/sort";
import { saveJSON } from "../lib/storage";
import { useAppDispatch, useAppState, VOLUME_KEY } from "../state/context";
import type { ListResponse } from "../types/api";
import type { FileEntry } from "../types/library";

export interface AudioApi {
  engine: AudioEngine;
  togglePlay: () => void;
  playFile: (file: FileEntry) => void;
  nextFile: () => void;
  prevFile: () => void;
  seekBy: (d: number) => void;
  cycleSpeed: () => void;
  setVolume: (v: number) => void;
  nudgeVolume: (d: number) => void;
  canPrev: boolean;
  canNext: boolean;
}

export const AudioCtx = createContext<AudioApi | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const qc = useQueryClient();
  const engineRef = useRef<AudioEngine | null>(null);
  if (engineRef.current === null) engineRef.current = new AudioEngine();
  const engine = engineRef.current;
  const stateRef = useRef(state);
  stateRef.current = state;
  const loadedPath = useRef<string | null>(null);

  const folderPath = state.current?.folderPath;
  // The current folder's file list (shared cache key) — whether next/prev
  // have anywhere to go within the folder.
  const folderQuery = useQuery({
    queryKey: folderKey(folderPath ?? ""),
    queryFn: () => listFolder(folderPath as string),
    enabled: folderPath !== null,
  });
  const deadPaths = useMemo(() => new Set(state.deadPaths), [state.deadPaths]);
  const { canPrev, canNext } = useMemo(() => {
    if (state.current === null || folderQuery.data === undefined) {
      return { canPrev: false, canNext: false };
    }
    const files = sortFiles(folderQuery.data.files, state.sort);
    return {
      canPrev: stepIn(files, state.current.path, -1, deadPaths) !== null,
      canNext: stepIn(files, state.current.path, 1, deadPaths) !== null,
    };
  }, [state.current, folderQuery.data, state.sort, deadPaths]);

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
    saveJSON(VOLUME_KEY, state.volume);
  }, [state.volume, engine]);

  // Advance within the current folder, skipping dead files.
  const advance = useCallback(
    async (dir: 1 | -1): Promise<boolean> => {
      const cur = stateRef.current.current;
      if (cur === null) return false;
      let files = qc.getQueryData<ListResponse>(folderKey(cur.folderPath))?.files;
      if (files === undefined) {
        try {
          const data = await qc.ensureQueryData({
            queryKey: folderKey(cur.folderPath),
            queryFn: () => listFolder(cur.folderPath),
          });
          files = data.files;
        } catch (err) {
          toast.error(errorMessage(err));
          return false;
        }
      }
      const next = stepIn(
        sortFiles(files, stateRef.current.sort),
        cur.path,
        dir,
        new Set(stateRef.current.deadPaths),
      );
      if (next === null) return false;
      dispatch({
        type: "playFile",
        file: {
          path: next.path,
          name: next.name,
          folderPath: cur.folderPath,
          duration: next.duration,
        },
      });
      return true;
    },
    [qc, dispatch],
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
        if (path !== undefined && cur !== null && cur.path === path) {
          dispatch({ type: "markDead", path });
          toast.error(`Could not play "${cur.name}" — file not found.`);
        }
      }),
      engine.on("ended", () => {
        void advanceRef.current(1).then((advanced) => {
          if (!advanced) dispatch({ type: "setPlaying", playing: false });
        });
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
      playFile: (file) => {
        dispatch({
          type: "playFile",
          file: {
            path: file.path,
            name: file.name,
            folderPath: parentFolder(file.path),
            duration: file.duration,
          },
        });
      },
      nextFile: () => {
        void advance(1);
      },
      prevFile: () => {
        if (engine.getPosition() > 3) {
          engine.seek(0);
          return;
        }
        void advance(-1);
      },
      seekBy: (d) => engine.seekBy(d),
      cycleSpeed: () => dispatch({ type: "cycleSpeed" }),
      setVolume: (v) => dispatch({ type: "setVolume", volume: v }),
      nudgeVolume: (d) => dispatch({ type: "setVolume", volume: stateRef.current.volume + d }),
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
