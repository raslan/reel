import type { FolderAliasesResponse, ListResponse, OkResponse } from "../../types/api";
import { http } from "./http";

export function listFolder(path: string, signal?: AbortSignal): Promise<ListResponse> {
  return http.get<ListResponse>(`/api/list?path=${encodeURIComponent(path)}`, signal);
}

export function getFolderAliases(signal?: AbortSignal): Promise<FolderAliasesResponse> {
  return http.get<FolderAliasesResponse>("/api/folder-aliases", signal);
}

export function setFolderAlias(path: string, name: string): Promise<OkResponse> {
  return http.post<OkResponse>("/api/folder-aliases", { path, name });
}

export function clearFolderAlias(path: string): Promise<OkResponse> {
  return http.del<OkResponse>(`/api/folder-aliases?path=${encodeURIComponent(path)}`);
}
