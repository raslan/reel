import { useEffect } from "react";
import { useAppState } from "../state/context";
import { useAudio } from "./useAudio";

/** Seconds moved by lock-screen / headset skip buttons that don't say how far. */
const DEFAULT_SKIP_S = 5;

/**
 * Mirrors the player into the OS media controls (lock screen, Bluetooth headset
 * buttons, hardware media keys, the browser's media hub). Buttons we can't honour
 * (previous/next with nowhere to go) get no handler so the OS hides them.
 */
export function useMediaSession(): void {
  const session = typeof navigator === "undefined" ? undefined : navigator.mediaSession;
  const { engine, nextFile, prevFile, seekBy, canPrev, canNext } = useAudio();
  const { current, playing, speed } = useAppState();

  const path = current?.path ?? null;
  const name = current?.name;
  const folder = current?.folderPath;

  useEffect(() => {
    if (!session) return;
    if (path === null || name === undefined) {
      session.metadata = null;
      return;
    }
    session.metadata = new MediaMetadata({
      title: name,
      // The folder reads as the "album" line on lock screens: where this file lives.
      artist: folder === "" || folder === undefined ? "Library" : (folder.split("/").pop() ?? ""),
      album: "Reel",
    });
  }, [session, path, name, folder]);

  useEffect(() => {
    if (!session) return;
    session.playbackState = path === null ? "none" : playing ? "playing" : "paused";
  }, [session, path, playing]);

  // Position drives the lock-screen scrubber; refresh it whenever it could have jumped or changed rate.
  useEffect(() => {
    if (!session || path === null) return;
    const push = () => {
      const duration = engine.getDuration();
      if (duration <= 0) return;
      try {
        session.setPositionState({
          duration,
          playbackRate: speed,
          position: Math.min(Math.max(0, engine.getPosition()), duration),
        });
      } catch {
        // Some browsers reject inconsistent values mid-load; the next event corrects it.
      }
    };
    push();
    const offs = (["play", "pause", "seeked", "duration"] as const).map((e) => engine.on(e, push));
    return () => {
      offs.forEach((off) => {
        off();
      });
    };
  }, [session, engine, path, speed]);

  useEffect(() => {
    if (!session) return;
    const handlers: [MediaSessionAction, MediaSessionActionHandler | null][] = [
      ["play", () => engine.play()],
      ["pause", () => engine.pause()],
      ["previoustrack", canPrev ? prevFile : null],
      ["nexttrack", canNext ? nextFile : null],
      ["seekbackward", (d) => seekBy(-(d.seekOffset ?? DEFAULT_SKIP_S))],
      ["seekforward", (d) => seekBy(d.seekOffset ?? DEFAULT_SKIP_S)],
      ["seekto", (d) => engine.seek(d.seekTime ?? 0)],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Action not supported by this browser.
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // ignore
        }
      }
    };
  }, [session, engine, nextFile, prevFile, seekBy, canPrev, canNext]);
}
