import { useEffect, useRef } from "react";
import { useAudio } from "../hooks/useAudio";
import { fmt } from "../lib/format";

/** Position label driven directly by the engine sink — no React re-renders. */
export function LiveTime({ className }: { className?: string }) {
  const { engine } = useAudio();
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(
    () =>
      engine.registerSink((p) => {
        if (ref.current) ref.current.textContent = fmt(p);
      }),
    [engine],
  );
  return (
    <span ref={ref} className={className} aria-hidden>
      0:00
    </span>
  );
}
