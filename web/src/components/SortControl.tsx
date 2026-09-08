import { cn } from "cn";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { SortKey, SortPref } from "../types/player";

interface SortControlProps {
  sort: SortPref;
  onChange: (sort: SortPref) => void;
}

export function SortControl({ sort, onChange }: SortControlProps) {
  const btn = (key: SortKey, label: string) => (
    <button
      type="button"
      onClick={() => onChange({ key, dir: sort.key === key ? ((sort.dir * -1) as 1 | -1) : 1 })}
      className={cn(
        "ghost-btn flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px]",
        sort.key === key ? "text-gold" : "text-dim/70",
      )}
      title={`Sort by ${label.toLowerCase()}`}
    >
      {label}
      {sort.key === key ? (
        sort.dir === 1 ? (
          <ArrowUp className="w-3 h-3" />
        ) : (
          <ArrowDown className="w-3 h-3" />
        )
      ) : null}
    </button>
  );
  return (
    <div className="flex items-center gap-1">
      {btn("name", "Name")}
      {btn("duration", "Length")}
    </div>
  );
}
