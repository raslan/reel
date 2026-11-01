import { Search as SearchIcon, SearchX } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { FileRow } from "../components/FileRow";
import { SearchInput } from "../components/SearchInput";
import { SkeletonRows } from "../components/SkeletonRows";
import { SortControl } from "../components/SortControl";
import { VirtualRows } from "../components/VirtualRows";
import { useAudio } from "../hooks/useAudio";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useFavoritePaths } from "../hooks/useFavoritePaths";
import { useFavoriteToggle } from "../hooks/useFavoriteToggle";
import { useSearch } from "../hooks/useSearch";
import { sortFiles } from "../lib/sort";
import { useAppDispatch, useAppState } from "../state/context";

const SEARCH_DEBOUNCE_MS = 250;

export function SearchScreen() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { playFile } = useAudio();
  const { toggle } = useFavoriteToggle();
  const favSet = useFavoritePaths();
  const typed = state.searchQuery.trim() !== "";
  const debouncedQuery = useDebouncedValue(state.searchQuery, SEARCH_DEBOUNCE_MS);
  const search = useSearch(debouncedQuery);
  // Clearing the box empties the list at once rather than waiting out the debounce.
  const files = typed ? sortFiles(search.data?.files ?? [], state.sort) : [];
  const total = search.data?.total ?? 0;

  return (
    <div className="h-full flex flex-col">
      <div className="max-w-[920px] w-full mx-auto px-5 md:px-8 pt-6 md:pt-8 shrink-0">
        <h1 className="font-display font-bold text-[26px] md:text-[30px] tracking-tight">Search</h1>
        <p className="text-[12px] text-dim/50 mt-1 mb-4">Filename search across all libraries.</p>
        <SearchInput
          value={state.searchQuery}
          onChange={(q) => dispatch({ type: "setSearchQuery", query: q })}
          placeholder="Search all libraries..."
          autoFocus
          className="max-w-[420px]"
        />
        <div className="flex items-center gap-3 mt-4 mb-2">
          <SortControl sort={state.sort} onChange={(s) => dispatch({ type: "setSort", sort: s })} />
          <span className="font-mono text-[11px] text-dim/50">
            {typed && search.data
              ? files.length < total
                ? `${total} matches · showing first ${files.length}`
                : `${total} ${total === 1 ? "match" : "matches"}`
              : ""}
          </span>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {!typed ? (
          <EmptyState
            icon={SearchIcon}
            title="Search your library"
            hint="Type to find files by name across all libraries."
          />
        ) : search.isError ? (
          <EmptyState
            icon={SearchX}
            title="Search failed"
            hint="Check that the server is reachable."
          />
        ) : search.isPending ? (
          <SkeletonRows />
        ) : files.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No matches"
            hint={`Nothing named "${state.searchQuery.trim()}" in any library.`}
          />
        ) : (
          <div className="h-full max-w-[920px] w-full mx-auto px-5 md:px-8 pb-2">
            <VirtualRows
              count={files.length}
              keyOf={(i) => `p:${files[i]?.path ?? ""}`}
              renderRow={(i) => {
                const file = files[i];
                if (file === undefined) return null;
                return (
                  <FileRow
                    file={file}
                    onPlay={(f) => playFile(f, files)}
                    isCurrent={state.current?.path === file.path}
                    isPlaying={state.current?.path === file.path && state.playing}
                    isFav={favSet.has(file.path)}
                    onStar={toggle}
                    showPath
                  />
                );
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
