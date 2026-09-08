import { ChevronRight, Folder } from "lucide-react";
import type { FolderEntry } from "../types/library";

interface FolderRowProps {
  folder: FolderEntry;
  onOpen: (path: string) => void;
}

export function FolderRow({ folder, onOpen }: FolderRowProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(folder.path)}
      className="w-full flex items-center gap-3 px-3 h-[52px] rounded-lg hover:bg-panel transition-colors text-left group"
    >
      <div className="w-8 h-8 rounded-lg border border-line bg-panel/60 flex items-center justify-center shrink-0">
        <Folder className="w-4 h-4 text-gold/80" strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-medium truncate">{folder.name}</div>
      </div>
      <ChevronRight className="w-4 h-4 text-dim/40 group-hover:text-dim transition-colors shrink-0" />
    </button>
  );
}
