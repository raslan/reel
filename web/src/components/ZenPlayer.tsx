import { cn } from "cn";
import { Minus } from "lucide-react";
import { useAudio } from "../hooks/useAudio";
import { usePeaks } from "../hooks/usePeaks";
import { fmt } from "../lib/format";
import { useAppDispatch, useAppState } from "../state/context";
import { DeckStatus } from "./DeckStatus";
import { LiveTime } from "./LiveTime";
import { Transport } from "./Transport";
import { VolumeControl } from "./VolumeControl";
import { VUMeter } from "./VUMeter";
import { Waveform } from "./Waveform";

export function ZenPlayer() {
  const dispatch = useAppDispatch();
  const { current, speed, zen } = useAppState();
  const { cycleSpeed } = useAudio();
  const peaksQuery = usePeaks(current?.path ?? null);
  const peaks = peaksQuery.data?.status === "ready" ? (peaksQuery.data.peaks ?? null) : null;
  const spd = speed === 1 ? "1×" : `${speed}×`;
  if (!zen || current === null) return null;

  return (
    <div className="fixed inset-0 z-40 bg-bg grain flex flex-col items-center justify-center px-5 md:px-10">
      <div className="w-full max-w-[880px] flex flex-col items-center gap-6 md:gap-8">
        <div className="flex items-center gap-3">
          <DeckStatus />
          <button
            type="button"
            onClick={() => dispatch({ type: "closeZen" })}
            className="ghost-btn w-8 h-8 rounded-full flex items-center justify-center text-dim/70"
            title="Close (Esc)"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>

        <div className="w-full text-center">
          <div className="font-display font-bold text-[22px] md:text-[28px] tracking-tight truncate">
            {current.name}
          </div>
          <div className="font-mono text-[11.5px] text-dim/50 mt-1 truncate">
            {current.folderPath === "" ? "Library" : current.folderPath}
          </div>
        </div>

        <div className="w-full">
          <Waveform bars={120} peaks={peaks} className="h-[110px] md:h-[140px]" />
          <div className="flex items-center justify-between mt-2">
            <LiveTime className="font-mono text-[12px] text-dim/60" />
            <span className="font-mono text-[12px] text-dim/60">
              {fmt(current.duration ?? null)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 md:gap-6">
          <Transport size="zen" />
        </div>

        <div className="flex items-center gap-4 md:gap-6">
          <VUMeter />
          <button
            type="button"
            onClick={cycleSpeed}
            className={cn(
              "ghost-btn h-8 px-2.5 rounded-md font-mono text-[11.5px]",
              speed === 1 ? "text-gold" : "text-dim/70",
            )}
            title="Playback speed"
          >
            {spd}
          </button>
          <VolumeControl />
        </div>
      </div>
    </div>
  );
}
