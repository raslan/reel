import { cn } from "cn";
import { Maximize2 } from "lucide-react";
import { fmt } from "../lib/format";
import { useAppDispatch, useAppState } from "../state/context";
import { LiveTime } from "./LiveTime";
import { RepeatButton } from "./RepeatButton";
import { SpeedButton } from "./SpeedButton";
import { Transport } from "./Transport";
import { VolumeControl } from "./VolumeControl";
import { Waveform } from "./Waveform";

interface PlayerBarProps {
  /** Real peaks for the current file, or null while pending/failed. */
  peaks: number[] | null;
}

/**
 * Timeline-style player: the waveform runs the full width on top, with the
 * times at its ends; below it the title, transport and controls. On wide
 * screens that's one row of three; on phones the transport gets its own row
 * and volume is left to the device's buttons.
 */
export function PlayerBar({ peaks }: PlayerBarProps) {
  const dispatch = useAppDispatch();
  const { current } = useAppState();
  const folderName = current
    ? current.folderPath === ""
      ? "Library"
      : current.folderPath.split("/").pop()
    : "";
  const openZen = () => dispatch({ type: "openZen" });

  return (
    <div className="border-t border-line bg-panel brushed px-3 md:px-6 py-2.5 flex flex-col gap-2">
      <div className="flex items-center gap-2.5 md:gap-3">
        <LiveTime className="font-mono text-[11px] text-dim/60 w-10 text-right shrink-0" />
        <Waveform bars={72} fit peaks={peaks} className="flex-1 h-8" />
        <span className="font-mono text-[11px] text-dim/60 w-10 shrink-0">
          {fmt(current?.duration ?? null)}
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1">
        <button
          type="button"
          onClick={openZen}
          disabled={current === null}
          title={current ? current.name : "Open zen player"}
          className="min-w-0 text-left rounded-md hover:text-gold transition-colors disabled:pointer-events-none"
        >
          <div className="text-[13.5px] font-semibold truncate leading-tight">
            {current ? current.name : "Nothing playing"}
          </div>
          <div className="text-[11px] text-dim/50 truncate">{folderName}</div>
        </button>

        <div className="col-span-2 row-start-2 md:col-span-1 md:col-start-2 md:row-start-1 justify-self-center">
          <Transport />
        </div>

        <div className="col-start-2 row-start-1 md:col-start-3 justify-self-end flex items-center gap-1 md:gap-2">
          <SpeedButton />
          <RepeatButton />
          <VolumeControl className="hidden md:flex" />
          <button
            type="button"
            onClick={openZen}
            disabled={current === null}
            title="Open zen player"
            aria-label="Open zen player"
            className={cn(
              "ghost-btn w-9 h-9 rounded-full flex items-center justify-center text-dim/70",
              current === null && "opacity-30 pointer-events-none",
            )}
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
