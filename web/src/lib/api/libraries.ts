import type { LibrariesResponse } from "../../types/api";
import { http } from "./http";

export function getLibraries(): Promise<LibrariesResponse> {
  return http.get<LibrariesResponse>("/api/libraries");
}
