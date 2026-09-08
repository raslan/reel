import { cn } from "cn";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useAudio } from "../hooks/useAudio";
import { downsample } from "../lib/peaks/downsample";
import { waveColor } from "../lib/wave";

interface WaveformProps {
  bars: number;
  /** Real peaks (1024 values) or null while pending/failed. */
  peaks: number[] | null;
  className?: string;
  seekable?: boolean;
}

const PLACEHOLDER = 0.1;

export function Waveform({ bars, peaks, className, seekable = true }: WaveformProps) {
  const { engine } = useAudio();
  const heights = useMemo(() => (peaks === null ? null : downsample(peaks, bars)), [peaks, bars]);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Playhead + gold fill: direct DOM writes at 60fps, no React re-renders.
  useEffect(
    () =>
      engine.registerSink((position, duration) => {
        const p = duration > 0 ? (position / duration) * 100 : 0;
        if (fillRef.current) fillRef.current.style.clipPath = `inset(0 ${100 - p}% 0 0)`;
        if (headRef.current) headRef.current.style.left = `${p}%`;
        if (rootRef.current) {
          rootRef.current.setAttribute("aria-valuemax", String(Math.round(duration)));
          rootRef.current.setAttribute("aria-valuenow", String(Math.round(position)));
        }
      }),
    [engine],
  );

  const barHeights = heights ?? Array.from({ length: bars }, () => PLACEHOLDER);
  const n = barHeights.length;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!seekable) return;
    // Keep seek gestures from triggering click handlers on enclosing chips.
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const apply = (clientX: number) => {
      const r = el.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      engine.seek(f * engine.getDuration());
    };
    apply(e.clientX);
    let last = 0;
    const onMove = (ev: PointerEvent) => {
      const now = performance.now();
      if (now - last > 100) {
        last = now;
        apply(ev.clientX);
      }
    };
    const onUp = (ev: PointerEvent) => {
      apply(ev.clientX);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!seekable) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      engine.seekBy(5);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      engine.seekBy(-5);
    }
  };

  return (
    <div
      ref={rootRef}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={0}
      aria-valuenow={0}
      tabIndex={seekable ? 0 : -1}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={cn("wave", !seekable && "wave-static", className)}
    >
      <div className="layer base">
        {barHeights.map((h, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: bars are positional, stable count
          <i key={i} style={{ height: `${Math.round(h * 100)}%` }} />
        ))}
      </div>
      <div className="layer fill" ref={fillRef}>
        {barHeights.map((h, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: bars are positional, stable count
          <i key={i} style={{ height: `${Math.round(h * 100)}%`, background: waveColor(i, n) }} />
        ))}
      </div>
      <div className="head" ref={headRef} />
    </div>
  );
}
