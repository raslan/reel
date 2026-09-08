/** Parent folder of a file path: "a/b/c.mp3" -> "a/b"; "c.mp3" -> "". */
export function parentFolder(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}
