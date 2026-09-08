import type { PeaksResponse } from "../../types/api";

/**
 * The peaks endpoint is binary when ready: 4096 bytes = 1024 × float32
 * (values normalized 0.08–0.96, see server/peaks.ts). 202 = computation
 * started (poll again); JSON body = failed.
 */
export async function getPeaks(path: string): Promise<PeaksResponse> {
  const res = await fetch(`/api/peaks?path=${encodeURIComponent(path)}`);
  if (res.status === 202) return { status: "pending" };
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/octet-stream")) {
    const floats = new Float32Array(await res.arrayBuffer());
    return { status: "ready", peaks: Array.from(floats) };
  }
  return { status: "failed" };
}
