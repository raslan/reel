/**
 * Downsample `peaks` (any length) to exactly `bars` buckets, taking the max
 * per bucket. The server sends 1024 buckets; the UI needs 12/72/120.
 */
export function downsample(peaks: number[], bars: number): number[] {
  if (bars <= 0 || peaks.length === 0) return [];
  const out = new Array<number>(bars).fill(0);
  const per = peaks.length / bars;
  for (let i = 0; i < peaks.length; i++) {
    const b = Math.min(bars - 1, Math.floor(i / per));
    const v = peaks[i];
    if (v !== undefined && v > (out[b] ?? 0)) out[b] = v;
  }
  return out;
}
