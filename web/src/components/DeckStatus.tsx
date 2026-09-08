import { useEffect, useState } from "react";
import { useAudio } from "../hooks/useAudio";
import { useAppState } from "../state/context";

/** LED + STANDBY / PAUSED / PLAYING. Re-renders on seeked so a seek-to-0 updates it. */
export function DeckStatus({ className }: { className?: string }) {
  const { engine } = useAudio();
  const { playing, current } = useAppState();
  const [, setTick] = useState(0);
  useEffect(() => engine.on("seeked", () => setTick((t) => t + 1)), [engine]);
  const started = current !== null && engine.getPosition() > 0;
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
