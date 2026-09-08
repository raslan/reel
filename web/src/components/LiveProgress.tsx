import { useEffect, useRef } from "react";
import { useAudio } from "../hooks/useAudio";

/** 2px mobile progress line, sink-driven. */
export function LiveProgress() {
  const { engine } = useAudio();
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(
    () =>
      engine.registerSink((p, d) => {
        if (ref.current) ref.current.style.width = `${d > 0 ? (p / d) * 100 : 0}%`;
      }),
    [engine],
  );
  return (
    <div
      ref={ref}
      className="md:hidden absolute top-0 left-0 h-[2px] w-0 bg-gradient-to-r from-gold to-orange"
    />
  );
}
