export const favoritesKey = ["favorites"] as const;
export const folderKey = (path: string) => ["folder", path] as const;
export const searchKey = (q: string, folder: string | null) => ["search", q, folder] as const;
export const peaksKey = (path: string) => ["peaks", path] as const;
