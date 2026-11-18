import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, FolderX, SearchX } from "lucide-react";
import { toast } from "sonner";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { EmptyState } from "../components/EmptyState";
import { FileRow } from "../components/FileRow";
import { FolderRow } from "../components/FolderRow";
import { FolderTitle } from "../components/FolderTitle";
import { SearchInput } from "../components/SearchInput";
import { SkeletonRows } from "../components/SkeletonRows";
import { SortControl } from "../components/SortControl";
import { VirtualRows } from "../components/VirtualRows";
import { useAudio } from "../hooks/useAudio";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useFavoritePaths } from "../hooks/useFavoritePaths";
import { useFavoriteToggle } from "../hooks/useFavoriteToggle";
import { useFolder } from "../hooks/useFolder";
import { useFolderAliases } from "../hooks/useFolderAliases";
import { useSearch } from "../hooks/useSearch";
import { clearFolderAlias, errorMessage, setFolderAlias } from "../lib/api";
import { folderAliasesKey } from "../lib/keys";
import { folderLabel } from "../lib/path";
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
  const aliasesQuery = useFolderAliases();
  const aliases = aliasesQuery.data?.aliases ?? {};
  const labelOf = (path: string) => folderLabel(aliases, path);
  const qc = useQueryClient();
  const invalidateAliases = () => void qc.invalidateQueries({ queryKey: folderAliasesKey });
  const rename = useMutation({
    mutationFn: ({ path, name }: { path: string; name: string }) => setFolderAlias(path, name),
    onSuccess: invalidateAliases,
    onError: (err) => toast.error(errorMessage(err)),
  });
  const resetAlias = useMutation({
    mutationFn: (path: string) => clearFolderAlias(path),
    onSuccess: invalidateAliases,
    onError: (err) => toast.error(errorMessage(err)),
  });
  const debouncedQuery = useDebouncedValue(state.folderQuery, SEARCH_DEBOUNCE_MS);
  const search = useSearch(debouncedQuery, state.folderPath);
  // Keep showing the folder until the first results arrive instead of flashing a skeleton;
  // clearing the box returns to the folder at once.
  const typed = state.folderQuery.trim() !== "";
  const searching = typed && search.data !== undefined;
  const isPending = folder.isPending;
  const isError = folder.isError || (typed && search.isError);
  const files = sortFiles((searching ? search.data?.files : folder.data?.files) ?? [], state.sort);
  const folders = searching
    ? []
    : [...(folder.data?.folders ?? [])].sort((a, b) =>
        labelOf(a.path).localeCompare(labelOf(b.path), undefined, { sensitivity: "base" }),
      );
  const rows: Row[] = [
    ...folders.map((f) => ({ kind: "folder" as const, folder: f })),
    ...files.map((f) => ({ kind: "file" as const, file: f })),
  ];
  const crumbs =
    state.folderPath === ""
      ? []
      : state.folderPath.split("/").map((_, i, all) => {
          const path = all.slice(0, i + 1).join("/");
          return { label: labelOf(path), path };
        });
  const title = labelOf(state.folderPath);
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
          <FolderTitle
            path={state.folderPath}
            label={title}
            realName={
              state.folderPath === ""
                ? "Library"
                : (state.folderPath.split("/").pop() ?? state.folderPath)
            }
            busy={rename.isPending || resetAlias.isPending}
            onRename={(name) => rename.mutateAsync({ path: state.folderPath, name })}
            onReset={() => resetAlias.mutateAsync(state.folderPath)}
          />
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
                      label={labelOf(row.folder.path)}
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
