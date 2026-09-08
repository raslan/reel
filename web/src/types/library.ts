export interface LibraryInfo {
  name: string;
  path: string;
  audioFiles: number;
  enabled: boolean;
}

export interface FolderEntry {
  name: string;
  path: string;
}

export interface FileEntry {
  name: string;
  path: string;
  duration: number | null;
  size: number;
}
