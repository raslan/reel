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

export function waveColor(i: number, n: number): string {
  const [a, b] = tokens();
  const t = n > 1 ? i / (n - 1) : 0;
  const mix = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${mix(a[0], b[0])}, ${mix(a[1], b[1])}, ${mix(a[2], b[2])})`;
}
