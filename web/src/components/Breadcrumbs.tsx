import { ChevronRight } from "lucide-react";

export interface Crumb {
  /** Display label (alias, or the real segment name). */
  label: string;
  /** Real relative folder path, used for navigation. */
  path: string;
}

interface BreadcrumbsProps {
  crumbs: Crumb[];
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
            const last = i === crumbs.length - 1;
            return (
              <span key={c.path} className="flex items-center gap-1 min-w-0">
                <ChevronRight className="w-3.5 h-3.5 shrink-0 text-dim/40" />
                {last ? (
                  <span className="text-fg/90 truncate" title={c.path}>
                    {c.label}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onNavigate(c.path)}
                    className="hover:text-fg transition-colors truncate"
                    title={c.path}
                  >
                    {c.label}
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
