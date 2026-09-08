import { cn } from "cn";
import { ChevronUp, Maximize2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useAudio } from "../hooks/useAudio";
import { usePeaks } from "../hooks/usePeaks";
import { fmt } from "../lib/format";
import { useAppDispatch, useAppState } from "../state/context";
import { DeckStatus } from "./DeckStatus";
import { LiveProgress } from "./LiveProgress";
import { LiveTime } from "./LiveTime";
import { Transport } from "./Transport";
import { VolumeControl } from "./VolumeControl";
import { Waveform } from "./Waveform";

export function PlayerBar() {
  const dispatch = useAppDispatch();
  const { current, playing, speed } = useAppState();
  const { togglePlay, nextFile, prevFile, cycleSpeed } = useAudio();
  const peaksQuery = usePeaks(current?.path ?? null);
  const peaks = peaksQuery.data?.status === "ready" ? (peaksQuery.data.peaks ?? null) : null;
  const spd = speed === 1 ? "1×" : `${speed}×`;
  const folderName = current
    ? current.folderPath === ""
      ? "Library"
      : current.folderPath.split("/").pop()
    : "";

  return (
    <div className="relative border-t border-line bg-panel brushed px-3 md:px-6 pt-3 md:pt-3.5 pb-3.5 md:pb-3.5">
      <LiveProgress />
      <div className="flex items-center gap-3 md:gap-5">
        <button
          type="button"
          className="flex flex-1 min-w-0 md:flex-none md:w-[142px] items-center gap-2.5 rounded-lg border border-line bg-bg/70 px-2.5 py-1.5 text-left hover:border-gold/40 transition-colors"
          title="Open zen player"
        >
          <Waveform bars={12} peaks={peaks} className="w-[72px] h-7 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold truncate leading-tight">
              {current?.name ?? "—"}
            </div>
            <div className="text-[11px] text-dim/50 truncate">{folderName}</div>
          </div>
        </button>

        {/* Transport */}
        <div className="hidden md:flex items-center gap-2.5">
          <Transport />
        </div>

        {/* 72-bar waveform — desktop only */}
        <div className="hidden md:flex items-center gap-2.5 flex-1">
          <LiveTime className="font-mono text-[11.5px] text-dim/60 w-10 text-right shrink-0" />
          <Waveform bars={72} peaks={peaks} className="flex-1 h-7" />
          <span className="font-mono text-[11.5px] text-dim/60 w-10 shrink-0">
            {fmt(current?.duration ?? null)}
          </span>
        </div>

        {/* Right cluster */}
        <div className="hidden md:flex items-center gap-2.5 shrink-0">
          <DeckStatus />
          <button
            type="button"
            onClick={cycleSpeed}
            className={cn(
              "ghost-btn w-8 h-8 rounded-md font-mono text-[11.5px]",
              speed === 1 ? "text-gold" : "text-dim/70",
            )}
            title="Playback speed"
          >
            {spd}
          </button>
          <VolumeControl />
          <button
            type="button"
            onClick={() => dispatch({ type: "openZen" })}
            disabled={current === null}
            className={cn(
              "ghost-btn w-9 h-9 rounded-full flex items-center justify-center text-dim/70",
              current === null && "opacity-30 pointer-events-none",
            )}
            title="Open zen player"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        {/* Mobile transport */}
        <div className="flex md:hidden items-center gap-2.5">
          <button
            type="button"
            onClick={prevFile}
            disabled={current === null}
            className="ghost-btn w-9 h-9 rounded-full flex items-center justify-center text-dim/70"
            title="Previous in folder"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            disabled={current === null}
            className={cn(
              "play-btn w-10 h-10 rounded-full bg-gold text-bg flex items-center justify-center",
              current === null && "opacity-30 pointer-events-none",
            )}
            title="Play / pause"
          >
            {playing ? (
              <Pause className="w-5 h-5" fill="currentColor" />
            ) : (
              <Play className="w-5 h-5 translate-x-[1px]" fill="currentColor" />
            )}
          </button>
          <button
            type="button"
            onClick={nextFile}
            disabled={current === null}
            className="ghost-btn w-9 h-9 rounded-full flex items-center justify-center text-dim/70"
            title="Next in folder"
          >
            <SkipForward className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "openZen" })}
            disabled={current === null}
            className={cn(
              "ghost-btn w-9 h-9 rounded-full flex items-center justify-center text-dim/70",
              current === null && "opacity-30 pointer-events-none",
            )}
            title="Open zen player"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
