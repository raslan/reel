import type { SearchResponse } from "../../types/api";
import { http } from "./http";

export function searchFiles(q: string, folder?: string): Promise<SearchResponse> {
  const params = new URLSearchParams({ q });
  if (folder) params.set("folder", folder);
  return http.get<SearchResponse>(`/api/search?${params.toString()}`);
}
