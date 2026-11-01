import { Star, StarOff } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { FileRow } from "../components/FileRow";
import { SkeletonRows } from "../components/SkeletonRows";
import { VirtualRows } from "../components/VirtualRows";
import { useAudio } from "../hooks/useAudio";
import { useFavorites } from "../hooks/useFavorites";
import { useFavoriteToggle } from "../hooks/useFavoriteToggle";
import { sortFiles } from "../lib/sort";
import { useAppState } from "../state/context";

export function FavoritesScreen() {
  const state = useAppState();
  const { playFile } = useAudio();
  const { toggle } = useFavoriteToggle();
  const favorites = useFavorites();
  const sorted = sortFiles(favorites.data?.files ?? [], state.sort);

  return (
    <div className="h-full flex flex-col">
      <div className="max-w-[920px] w-full mx-auto px-5 md:px-8 pt-6 md:pt-8 shrink-0">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-display font-bold text-[26px] md:text-[30px] tracking-tight">
            Favorites
          </h1>
          <span className="font-mono text-[11px] text-dim/50 shrink-0">
            {favorites.data ? `${sorted.length} starred` : ""}
          </span>
        </div>
        <p className="text-[12px] text-dim/50 mt-1 mb-2">
          Files you starred, across all libraries.
        </p>
      </div>
      <div className="flex-1 h-full min-h-0">
        {favorites.isPending ? (
          <SkeletonRows count={5} />
        ) : favorites.isError ? (
          <EmptyState
            icon={StarOff}
            title="Could not load favorites"
            hint="Check that the server is reachable."
          />
        ) : sorted.length === 0 ? (
          <EmptyState icon={Star} title="No favorites yet" hint="Star a file to pin it here." />
        ) : (
          <div className="max-w-[920px] h-full w-full mx-auto px-5 md:px-8 pb-2">
            <VirtualRows
              count={sorted.length}
              keyOf={(i) => `p:${sorted[i]?.path ?? ""}`}
              renderRow={(i) => {
                const file = sorted[i];
                if (file === undefined) return null;
                return (
                  <FileRow
                    file={file}
                    onPlay={(f) => playFile(f, sorted)}
                    isCurrent={state.current?.path === file.path}
                    isPlaying={state.current?.path === file.path && state.playing}
                    isFav
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
