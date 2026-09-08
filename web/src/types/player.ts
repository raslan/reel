export interface CurrentFile {
  path: string;
  name: string;
  folderPath: string;
  duration: number | null;
}

export type SortKey = "name" | "duration";

export interface SortPref {
  key: SortKey;
  dir: 1 | -1;
}
