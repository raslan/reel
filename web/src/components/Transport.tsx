import { cn } from "cn";
import { Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward } from "lucide-react";
import { useAudio } from "../hooks/useAudio";
import { useAppState } from "../state/context";

interface TransportProps {
  size?: "bar" | "zen";
}

export function Transport({ size = "bar" }: TransportProps) {
  const { togglePlay, nextFile, prevFile, seekBy, canPrev, canNext } = useAudio();
  const { playing, current } = useAppState();
  const disabled = current === null;
  const ghost = "ghost-btn flex items-center justify-center rounded-full text-dim/70";
  const btn = size === "zen" ? "w-10 h-10" : "w-9 h-9";
  const play = size === "zen" ? "w-14 h-14" : "w-11 h-11";
  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={prevFile}
        disabled={disabled || !canPrev}
        className={cn(ghost, btn)}
        title="Previous in folder"
      >
        <SkipBack className="w-[18px] h-[18px]" />
      </button>
      <button
        type="button"
        onClick={() => seekBy(-5)}
        disabled={disabled}
        className={cn(ghost, btn)}
        title="Back 5 seconds"
      >
        <RotateCcw className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={togglePlay}
        disabled={disabled}
        className={cn(
          "play-btn flex items-center justify-center rounded-full bg-gold text-bg",
          play,
          disabled && "opacity-30 pointer-events-none",
        )}
        title="Play / pause"
      >
        {playing ? (
          <Pause className="w-6 h-6" fill="currentColor" />
        ) : (
          <Play className="w-6 h-6 translate-x-[1px]" fill="currentColor" />
        )}
      </button>
      <button
        type="button"
        onClick={() => seekBy(5)}
        disabled={disabled}
        className={cn(ghost, btn)}
        title="Forward 5 seconds"
      >
        <RotateCw className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={nextFile}
        disabled={disabled || !canNext}
        className={cn(ghost, btn)}
        title="Next in folder"
      >
        <SkipForward className="w-[18px] h-[18px]" />
      </button>
    </div>
  );
}
