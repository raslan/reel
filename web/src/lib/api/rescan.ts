import type { RescanStarted } from "../../types/api";
import { http } from "./http";

export function rescan(): Promise<RescanStarted> {
  return http.post<RescanStarted>("/api/rescan");
}
