import { Search as SearchIcon, SearchX } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { FileRow } from "../components/FileRow";
import { SearchInput } from "../components/SearchInput";
import { SkeletonRows } from "../components/SkeletonRows";
import { SortControl } from "../components/SortControl";
import { VirtualRows } from "../components/VirtualRows";
import { useAudio } from "../hooks/useAudio";
import { useFavorites } from "../hooks/useFavorites";
import { useFavoriteToggle } from "../hooks/useFavoriteToggle";
import { useSearch } from "../hooks/useSearch";
import { sortFiles } from "../lib/sort";
import { useAppDispatch, useAppState } from "../state/context";

export function SearchScreen() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { playFile } = useAudio();
  const { toggle } = useFavoriteToggle();
  const favorites = useFavorites();
  const favSet = new Set(favorites.data?.paths ?? []);
  const search = useSearch(state.searchQuery);
  const files = sortFiles(search.data?.files ?? [], state.sort);

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
            {search.data
              ? `${search.data.total} ${state.searchQuery.trim() === "" ? "files" : "matches"}`
              : ""}
          </span>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {search.isPending ? (
          <SkeletonRows />
        ) : files.length === 0 ? (
          state.searchQuery.trim() === "" ? (
            <EmptyState
              icon={SearchIcon}
              title="Search your library"
              hint="Type to find files by name across all libraries."
            />
          ) : (
            <EmptyState
              icon={SearchX}
              title="No matches"
              hint={`Nothing named "${state.searchQuery}" in any library.`}
            />
          )
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
                    onPlay={(f) => playFile(f)}
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
