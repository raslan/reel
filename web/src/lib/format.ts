/** "m:ss" (minutes keep counting past the hour, per the mockup), or "–" for an unknown duration. */
export function fmt(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "–";
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
