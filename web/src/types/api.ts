import type { FileEntry, FolderEntry } from "./library";

export interface ListResponse {
  folders: FolderEntry[];
  files: FileEntry[];
}

export interface SearchResponse {
  /** At most `limit` matches; `total` is the full match count. */
  files: FileEntry[];
  total: number;
}

export interface FavoritesResponse {
  files: FileEntry[];
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

export interface RescanStatus {
  running: boolean;
  last:
    | { ok: true; finishedAt: number; added: number; removed: number; changed: number }
    | { ok: false; finishedAt: number; error: string }
    | null;
}
