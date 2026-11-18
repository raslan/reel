/** Parent folder of a file path: "a/b/c.mp3" -> "a/b"; "c.mp3" -> "". */
export function parentFolder(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/**
 * What a folder is called on screen: its alias when one is set, else the last
 * real path segment ("" is the library root). The path itself never changes.
 */
export function folderLabel(aliases: Record<string, string>, path: string): string {
  const alias = aliases[path];
  if (alias !== undefined) return alias;
  return path === "" ? "Library" : (path.split("/").pop() ?? path);
}
