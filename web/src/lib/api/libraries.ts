import type { LibrariesResponse, OkResponse } from "../../types/api";
import { http } from "./http";

export function getLibraries(): Promise<LibrariesResponse> {
  return http.get<LibrariesResponse>("/api/libraries");
}

export function setLibraries(enabled: string[]): Promise<OkResponse> {
  return http.put<OkResponse>("/api/libraries", { enabled });
}
