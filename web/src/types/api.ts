import type { FileEntry, FolderEntry, LibraryInfo } from "./library";

export interface ListResponse {
  folders: FolderEntry[];
  files: FileEntry[];
}

export interface SearchResponse {
  files: FileEntry[];
  total: number;
}

export interface FavoritesResponse {
  paths: string[];
}

export interface LibrariesResponse {
  libraries: LibraryInfo[];
}

export interface OkResponse {
  ok: boolean;
}

type PeaksStatus = "ready" | "pending" | "failed";

export interface PeaksResponse {
  status: PeaksStatus;
  /** 1024 values in 0.08–0.96 (server-normalized), present only when status is 'ready'. */
  peaks?: number[];
}

export interface RescanStarted {
  status: string;
}
