import { useContext } from "react";
import { AudioCtx } from "../player/AudioProvider";

export function useAudio() {
  const ctx = useContext(AudioCtx);
  if (ctx === null) throw new Error("useAudio outside AudioProvider");
  return ctx;
}
