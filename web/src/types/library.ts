export interface FolderEntry {
  name: string;
  path: string;
}

export interface FileEntry {
  name: string;
  path: string;
  duration: number | null;
  size: number;
  /** Last-modified time, seconds since the epoch. */
  mtime: number;
}
