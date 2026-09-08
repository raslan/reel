import { cn } from "cn";
import { Search, X } from "lucide-react";
import { useEffect, useRef } from "react";

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
  autoFocus,
}: SearchInputProps) {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return (
    <div className={cn("relative flex items-center", className)}>
      <Search className="w-4 h-4 absolute left-3 text-dim/50 pointer-events-none" />
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type="text"
        aria-label={placeholder ?? "Search"}
        className="w-full h-9 pl-9 pr-8 rounded-lg bg-panel border border-line text-[13px] placeholder:text-dim/40 focus:border-gold/50 focus:outline-none transition-colors"
      />
      {value !== "" ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2.5 text-dim/50 hover:text-fg transition-colors"
          aria-label="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      ) : null}
    </div>
  );
}
