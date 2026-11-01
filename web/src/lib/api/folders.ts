import type { ListResponse } from "../../types/api";
import { http } from "./http";

export function listFolder(path: string, signal?: AbortSignal): Promise<ListResponse> {
  return http.get<ListResponse>(`/api/list?path=${encodeURIComponent(path)}`, signal);
}
