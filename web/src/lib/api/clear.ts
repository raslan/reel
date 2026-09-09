import type { OkResponse } from "../../types/api";
import { http } from "./http";

/** Wipe the index, favorites, and cached peaks. Files on disk are untouched. */
export function clearDb(): Promise<OkResponse> {
  return http.post<OkResponse>("/api/clear");
}
