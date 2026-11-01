import type { FavoritesResponse, OkResponse } from "../../types/api";
import { http } from "./http";

export function getFavorites(signal?: AbortSignal): Promise<FavoritesResponse> {
  return http.get<FavoritesResponse>("/api/favorites", signal);
}

export function addFavorite(path: string): Promise<OkResponse> {
  return http.post<OkResponse>("/api/favorites", { path });
}

export function removeFavorite(path: string): Promise<OkResponse> {
  return http.del<OkResponse>(`/api/favorites?path=${encodeURIComponent(path)}`);
}
