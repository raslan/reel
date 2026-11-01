import { cn } from "cn";
import { useAudio } from "../hooks/useAudio";
import { useAppState } from "../state/context";

/** Shows the playback speed ("1×", "1.5×"); click to cycle. Gold at normal speed, dim otherwise. */
export function SpeedButton({ className }: { className?: string }) {
  const { cycleSpeed } = useAudio();
  const { speed } = useAppState();
  return (
    <button
      type="button"
      onClick={cycleSpeed}
      title="Playback speed (S)"
      aria-label="Playback speed"
      className={cn(
        "ghost-btn h-9 md:h-8 min-w-9 md:min-w-8 px-2 rounded-md font-mono text-[11.5px]",
        speed === 1 ? "text-gold" : "text-dim/70",
        className,
      )}
    >
      {speed}×
    </button>
  );
}
