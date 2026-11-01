import { cn } from "cn";
import { Repeat, Repeat1 } from "lucide-react";
import { useAudio } from "../hooks/useAudio";
import { useAppState } from "../state/context";
import type { RepeatMode } from "../types/player";

const LABEL: Record<RepeatMode, string> = {
  off: "Repeat: off",
  queue: "Repeat: whole list",
  one: "Repeat: this file",
};

/** Cycles off → whole list → this file. Gold when on; the "1" badge marks repeat-one. */
export function RepeatButton({ className }: { className?: string }) {
  const { cycleRepeat } = useAudio();
  const { repeat } = useAppState();
  const Icon = repeat === "one" ? Repeat1 : Repeat;
  return (
    <button
      type="button"
      onClick={cycleRepeat}
      aria-label={LABEL[repeat]}
      aria-pressed={repeat !== "off"}
      title={`${LABEL[repeat]} (R)`}
      className={cn(
        "ghost-btn w-9 h-9 md:w-8 md:h-8 rounded-full flex items-center justify-center",
        repeat === "off" ? "text-dim/70" : "text-gold",
        className,
      )}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
