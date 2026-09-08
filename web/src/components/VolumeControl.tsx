import { Volume1, Volume2, VolumeX } from "lucide-react";
import { useAudio } from "../hooks/useAudio";
import { useAppState } from "../state/context";
import { Slider } from "./ui/slider";

export function VolumeControl({ className }: { className?: string }) {
  const { setVolume, nudgeVolume } = useAudio();
  const { volume } = useAppState();
  const Icon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => nudgeVolume(10)}
        className="ghost-btn w-8 h-8 rounded-full flex items-center justify-center text-dim/70"
        title="Volume"
      >
        <Icon className="w-[17px] h-[17px]" />
      </button>
      <Slider
        value={[volume]}
        max={100}
        step={1}
        onValueChange={(v) => setVolume(v[0] ?? 0)}
        className="w-[88px]"
        aria-label="Volume"
      />
    </div>
  );
}
