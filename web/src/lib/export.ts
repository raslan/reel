import type { FileEntry } from "../types/library";

/** One "name — path" line per favorite, in the order given. */
export function formatFavoritesText(files: FileEntry[]): string {
  if (files.length === 0) return "";
  return `${files.map((f) => `${f.name} — ${f.path}`).join("\n")}\n`;
}

/** Local-date download name, e.g. reel-favorites-2026-11-18.txt. */
export function favoritesFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `reel-favorites-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.txt`;
}

/** Save text as a browser download. */
export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
