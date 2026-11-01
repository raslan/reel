export interface CurrentFile {
  path: string;
  name: string;
  folderPath: string;
  duration: number | null;
}

/** What happens when a file ends: stop at the end of the queue, wrap the queue, or replay the file. */
export type RepeatMode = "off" | "queue" | "one";

export type SortKey = "name" | "duration" | "modified" | "size";

export interface SortPref {
  key: SortKey;
  dir: 1 | -1;
}
