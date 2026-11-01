import { cn } from "cn";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAudio } from "../hooks/useAudio";
import { fmt } from "../lib/format";
import { downsample } from "../lib/peaks/downsample";
import { barCount, waveColor } from "../lib/wave";

interface WaveformProps {
  /** Number of bars. With `fit`, only the count used until the width is measured. */
  bars: number;
  /** Real peaks (1024 values) or null while pending/failed. */
  peaks: number[] | null;
  className?: string;
  seekable?: boolean;
  /** Size the bar count to the element's width, keeping the standard density at any width. */
  fit?: boolean;
}

const PLACEHOLDER = 0.1;
/** Seconds moved by ←/→ on the focused seek bar. */
const KEY_SEEK_S = 5;

export function Waveform({ bars, peaks, className, seekable = true, fit = false }: WaveformProps) {
  const { engine } = useAudio();
  const fillRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [fitBars, setFitBars] = useState(bars);
  const count = fit ? fitBars : bars;
  const heights = useMemo(() => (peaks === null ? null : downsample(peaks, count)), [peaks, count]);

  // Measuring the DOM is an external system, so this effect (not render) owns the state it sets.
  useEffect(() => {
    const el = rootRef.current;
    if (!fit || el === null || typeof ResizeObserver === "undefined") return;
    const measure = () => setFitBars(barCount(el.clientWidth, bars));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit, bars]);

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
          rootRef.current.setAttribute("aria-valuetext", `${fmt(position)} of ${fmt(duration)}`);
        }
      }),
    [engine],
  );

  const barHeights = heights ?? Array.from({ length: count }, () => PLACEHOLDER);
  const n = barHeights.length;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Keep seek gestures from triggering click handlers on enclosing chips.
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const apply = (clientX: number) => {
      const duration = engine.getDuration();
      if (duration <= 0) return; // nothing loaded yet: a click must not rewind to 0
      const r = el.getBoundingClientRect();
      if (r.width <= 0) return;
      const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      engine.seek(f * duration);
    };
    engine.beginScrub();
    apply(e.clientX);
    const onMove = (ev: PointerEvent) => apply(ev.clientX);
    const onUp = (ev: PointerEvent) => {
      apply(ev.clientX);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      engine.endScrub();
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      engine.seekBy(KEY_SEEK_S);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      engine.seekBy(-KEY_SEEK_S);
    } else if (e.key === "Home") {
      e.preventDefault();
      engine.seek(0);
    } else if (e.key === "End") {
      e.preventDefault();
      engine.seek(engine.getDuration());
    }
  };

  // A non-seekable waveform is decoration (e.g. inside the track chip): no slider
  // semantics and no handlers, so it never swallows a click meant for its parent.
  const interactive = seekable
    ? {
        role: "slider",
        "aria-label": "Seek",
        "aria-valuemin": 0,
        "aria-valuemax": 0,
        "aria-valuenow": 0,
        tabIndex: 0,
        onPointerDown,
        onKeyDown,
      }
    : { "aria-hidden": true };

  return (
    <div
      ref={rootRef}
      {...interactive}
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
