/**
 * Per-bar tape color: gold -> orange across the window.
 * Reads the palette from CSS tokens once, so color stays token-driven.
 */
let gold: [number, number, number] | null = null;
let orange: [number, number, number] | null = null;

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function tokens(): [[number, number, number], [number, number, number]] {
  if (gold === null || orange === null) {
    const cs = getComputedStyle(document.documentElement);
    const g = parseHex(cs.getPropertyValue("--color-gold").trim() || "#e6b450");
    const o = parseHex(cs.getPropertyValue("--color-orange").trim() || "#ff8f40");
    gold = g;
    orange = o;
  }
  return [gold, orange];
}

/** Horizontal space per bar (≈4px bar + 2px gap): the density the waveform has always had. */
export const BAR_PITCH_PX = 6;
const MIN_BARS = 12;
/** The server sends this many peak values; more bars than that would just repeat them. */
const MAX_BARS = 1024;

/** How many bars fit `widthPx` at the standard density; `fallback` until the width is measured. */
export function barCount(widthPx: number, fallback: number): number {
  if (!Number.isFinite(widthPx) || widthPx <= 0) return fallback;
  return Math.min(MAX_BARS, Math.max(MIN_BARS, Math.floor(widthPx / BAR_PITCH_PX)));
}

export function waveColor(i: number, n: number): string {
  const [a, b] = tokens();
  const t = n > 1 ? i / (n - 1) : 0;
  const mix = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${mix(a[0], b[0])}, ${mix(a[1], b[1])}, ${mix(a[2], b[2])})`;
}
