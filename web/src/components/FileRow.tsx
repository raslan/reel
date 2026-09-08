import { cn } from "cn";
import { Play, Star } from "lucide-react";
import { fmt } from "../lib/format";
import type { FileEntry } from "../types/library";

interface FileRowProps {
  file: FileEntry;
  onPlay: (file: FileEntry) => void;
  isCurrent: boolean;
  isPlaying: boolean;
  isFav: boolean;
  onStar: (path: string, add: boolean) => void;
  /** Show the full path under the name (search/favorites results). */
  showPath?: boolean;
}

export function FileRow({
  file,
  onPlay,
  isCurrent,
  isPlaying,
  isFav,
  onStar,
  showPath,
}: FileRowProps) {
  return (
    <div
      className={cn(
        "w-full flex items-center gap-3 px-3 h-[52px] rounded-lg border transition-colors",
        isCurrent ? "bg-panel border-gold/25" : "border-transparent hover:bg-panel",
      )}
    >
      <button
        type="button"
        onClick={() => onPlay(file)}
        className="w-8 h-8 rounded-full bg-panel border border-line flex items-center justify-center shrink-0 hover:border-gold/50 transition-colors"
        aria-label={`Play ${file.name}`}
      >
        {isCurrent && isPlaying ? (
          <span className="eq" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </span>
        ) : (
          <Play className="w-3.5 h-3.5 text-gold translate-x-[0.5px]" fill="currentColor" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className={cn("text-[13.5px] font-medium truncate", isCurrent && "text-gold")}>
          {file.name}
        </div>
        {showPath ? <div className="text-[11px] text-dim/50 truncate">{file.path}</div> : null}
      </div>
      <span className="font-mono text-[11.5px] text-dim/60 shrink-0">{fmt(file.duration)}</span>
      <button
        type="button"
        onClick={() => onStar(file.path, !isFav)}
        className={cn(
          "w-8 h-8 rounded-md flex items-center justify-center shrink-0 transition-colors",
          isFav ? "star-on text-gold" : "text-dim/40 hover:text-dim",
        )}
        aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
      >
        <Star className="w-4 h-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}
