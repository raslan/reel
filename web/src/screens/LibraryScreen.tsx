import { FolderOpen, FolderX, SearchX } from "lucide-react";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { EmptyState } from "../components/EmptyState";
import { FileRow } from "../components/FileRow";
import { FolderRow } from "../components/FolderRow";
import { SearchInput } from "../components/SearchInput";
import { SkeletonRows } from "../components/SkeletonRows";
import { SortControl } from "../components/SortControl";
import { VirtualRows } from "../components/VirtualRows";
import { useAudio } from "../hooks/useAudio";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useFavoritePaths } from "../hooks/useFavoritePaths";
import { useFavoriteToggle } from "../hooks/useFavoriteToggle";
import { useFolder } from "../hooks/useFolder";
import { useSearch } from "../hooks/useSearch";
import { sortFiles } from "../lib/sort";
import { useAppDispatch, useAppState } from "../state/context";
import type { FileEntry, FolderEntry } from "../types/library";

type Row = { kind: "folder"; folder: FolderEntry } | { kind: "file"; file: FileEntry };

const SEARCH_DEBOUNCE_MS = 250;

export function LibraryScreen() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { playFile } = useAudio();
  const { toggle } = useFavoriteToggle();
  const favSet = useFavoritePaths();
  const folder = useFolder(state.folderPath);
  const debouncedQuery = useDebouncedValue(state.folderQuery, SEARCH_DEBOUNCE_MS);
  const search = useSearch(debouncedQuery, state.folderPath);
  // Keep showing the folder until the first results arrive instead of flashing a skeleton;
  // clearing the box returns to the folder at once.
  const typed = state.folderQuery.trim() !== "";
  const searching = typed && search.data !== undefined;
  const isPending = folder.isPending;
  const isError = folder.isError || (typed && search.isError);
  const files = sortFiles((searching ? search.data?.files : folder.data?.files) ?? [], state.sort);
  const folders = searching ? [] : (folder.data?.folders ?? []);
  const rows: Row[] = [
    ...folders.map((f) => ({ kind: "folder" as const, folder: f })),
    ...files.map((f) => ({ kind: "file" as const, file: f })),
  ];
  const crumbs = state.folderPath === "" ? [] : state.folderPath.split("/");
  const total = search.data?.total ?? 0;
  const currentLabel = searching
    ? files.length < total
      ? `${total} matches · showing first ${files.length}`
      : `${total} ${total === 1 ? "match" : "matches"}`
    : `${folders.length} folders · ${files.length} files`;

  return (
    <div className="h-full flex flex-col">
      <div className="max-w-[920px] w-full mx-auto px-5 md:px-8 pt-6 md:pt-8 shrink-0">
        <Breadcrumbs
          crumbs={crumbs}
          onNavigate={(p) => dispatch({ type: "setFolderPath", path: p })}
        />
        <div className="flex items-baseline justify-between gap-3 mt-2.5">
          <h1 className="font-display font-bold text-[26px] md:text-[30px] tracking-tight truncate">
            {state.folderPath === "" ? "Library" : state.folderPath.split("/").pop()}
          </h1>
          <span className="font-mono text-[11px] text-dim/50 shrink-0">{currentLabel}</span>
        </div>
        <div className="flex items-center gap-3 mt-3 mb-2">
          <SortControl sort={state.sort} onChange={(s) => dispatch({ type: "setSort", sort: s })} />
          <SearchInput
            value={state.folderQuery}
            onChange={(q) => dispatch({ type: "setFolderQuery", query: q })}
            placeholder="Search in this folder..."
            className="flex-1 max-w-[280px]"
          />
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {isPending ? (
          <SkeletonRows />
        ) : isError ? (
          <EmptyState
            icon={FolderX}
            title="Could not load this folder"
            hint="Check that the library is still mounted."
          />
        ) : rows.length === 0 ? (
          searching ? (
            <EmptyState
              icon={SearchX}
              title="No matches"
              hint={`Nothing named "${state.folderQuery.trim()}" here.`}
            />
          ) : (
            <EmptyState
              icon={FolderOpen}
              title="This folder is empty"
              hint="Audio files you drop into this folder will appear here."
            />
          )
        ) : (
          <div className="h-full max-w-[920px] w-full mx-auto px-5 md:px-8 pb-2">
            <VirtualRows
              count={rows.length}
              keyOf={(i) => {
                const row = rows[i];
                if (row === undefined) return `i:${i}`;
                return row.kind === "folder" ? `f:${row.folder.path}` : `p:${row.file.path}`;
              }}
              renderRow={(i) => {
                const row = rows[i];
                if (row === undefined) return null;
                if (row.kind === "folder") {
                  return (
                    <FolderRow
                      folder={row.folder}
                      onOpen={(p) => dispatch({ type: "setFolderPath", path: p })}
                    />
                  );
                }
                return (
                  <FileRow
                    file={row.file}
                    onPlay={(f) => playFile(f, files)}
                    isCurrent={state.current?.path === row.file.path}
                    isPlaying={state.current?.path === row.file.path && state.playing}
                    isFav={favSet.has(row.file.path)}
                    onStar={toggle}
                    showPath={searching}
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
