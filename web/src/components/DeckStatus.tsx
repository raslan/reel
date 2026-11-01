import { useSyncExternalStore } from "react";
import { useAudio } from "../hooks/useAudio";
import type { AudioEngine, EngineEvent } from "../lib/audio/engine";
import { useAppState } from "../state/context";

/** Events after which "has this file started?" can have changed. */
const POSITION_EVENTS: EngineEvent[] = ["play", "pause", "seeked", "duration"];

/** True once the element is past 0:00. Subscribed to the engine so render stays pure. */
function useStarted(engine: AudioEngine): boolean {
  return useSyncExternalStore(
    (notify) => {
      const offs = POSITION_EVENTS.map((event) => engine.on(event, notify));
      return () => {
        offs.forEach((off) => {
          off();
        });
      };
    },
    () => engine.getPosition() > 0,
  );
}

/** LED + STANDBY / PAUSED / PLAYING. */
export function DeckStatus({ className }: { className?: string }) {
  const { engine } = useAudio();
  const { playing, current } = useAppState();
  const started = useStarted(engine) && current !== null;
  const label = playing ? "PLAYING" : started ? "PAUSED" : "STANDBY";
  const led = playing ? "bg-green" : started ? "bg-gold" : "bg-gray";
  const text = playing ? "text-green" : started ? "text-gold" : "text-dim/60";
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <span className={`w-2 h-2 rounded-full ${led}`} />
      <span className={`font-mono text-[10.5px] tracking-[.18em] ${text}`}>{label}</span>
    </div>
  );
}
