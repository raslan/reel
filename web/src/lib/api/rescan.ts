import type { RescanStarted, RescanStatus } from "../../types/api";
import { http } from "./http";

export function rescan(): Promise<RescanStarted> {
  return http.post<RescanStarted>("/api/rescan");
}

export function getRescanStatus(signal?: AbortSignal): Promise<RescanStatus> {
  return http.get<RescanStatus>("/api/rescan", signal);
}
