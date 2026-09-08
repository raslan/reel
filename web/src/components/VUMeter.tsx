import { useAppState } from "../state/context";

/** Decorative meter: lit segments follow volume, top segment flickers while playing. */
export function VUMeter({ className }: { className?: string }) {
  const { volume, playing } = useAppState();
  const lit = volume === 0 ? 0 : Math.max(1, Math.round(volume / 10));
  return (
    <div className={`vu ${className ?? ""}`}>
      {Array.from({ length: 10 }, (_, i) => (
        <i
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional, fixed count
          key={i}
          className={i < lit ? `lit-${i + 1}${i === lit - 1 && playing ? " flicker" : ""}` : ""}
        />
      ))}
    </div>
  );
}
