import { ChevronRight } from "lucide-react";

interface BreadcrumbsProps {
  crumbs: string[];
  onNavigate: (path: string) => void;
}

export function Breadcrumbs({ crumbs, onNavigate }: BreadcrumbsProps) {
  return (
    <nav
      className="flex items-center gap-1 text-[12.5px] text-dim/60 min-w-0"
      aria-label="Breadcrumb"
    >
      {crumbs.length === 0 ? (
        <span className="text-fg/80">Library</span>
      ) : (
        <>
          <button
            type="button"
            onClick={() => onNavigate("")}
            className="hover:text-fg transition-colors shrink-0"
          >
            Library
          </button>
          {crumbs.map((c, i) => {
            const path = crumbs.slice(0, i + 1).join("/");
            const last = i === crumbs.length - 1;
            return (
              <span key={path} className="flex items-center gap-1 min-w-0">
                <ChevronRight className="w-3.5 h-3.5 shrink-0 text-dim/40" />
                {last ? (
                  <span className="text-fg/90 truncate">{c}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onNavigate(path)}
                    className="hover:text-fg transition-colors truncate"
                  >
                    {c}
                  </button>
                )}
              </span>
            );
          })}
        </>
      )}
    </nav>
  );
}
