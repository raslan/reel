import { cn } from "cn";
import { CassetteTape, FolderOpen, Search, Settings, Star } from "lucide-react";
import { useEffect } from "react";
import { PlayerBar } from "./components/PlayerBar";
import { ZenPlayer } from "./components/ZenPlayer";
import { useAudio } from "./hooks/useAudio";
import { useLibraryEvents } from "./hooks/useLibraryEvents";
import { FavoritesScreen } from "./screens/FavoritesScreen";
import { LibraryScreen } from "./screens/LibraryScreen";
import { SearchScreen } from "./screens/SearchScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { useAppDispatch, useAppState } from "./state/context";
import type { Screen } from "./state/reducer";

const NAV: { screen: Screen; label: string; icon: typeof FolderOpen }[] = [
  { screen: "search", label: "Search", icon: Search },
  { screen: "library", label: "Library", icon: FolderOpen },
  { screen: "favorites", label: "Favorites", icon: Star },
  { screen: "settings", label: "Settings", icon: Settings },
];

export function App() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { togglePlay, seekBy, cycleSpeed } = useAudio();
  useLibraryEvents();

  // Global keyboard: Space, arrows, Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight") {
        seekBy(5);
      } else if (e.key === "ArrowLeft") {
        seekBy(-5);
      } else if (e.key === "Escape") {
        dispatch({ type: "closeZen" });
      } else if (e.key === "s") {
        cycleSpeed();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, seekBy, cycleSpeed, dispatch]);

  const screen =
    state.screen === "search" ? (
      <SearchScreen />
    ) : state.screen === "favorites" ? (
      <FavoritesScreen />
    ) : state.screen === "settings" ? (
      <SettingsScreen />
    ) : (
      <LibraryScreen />
    );

  return (
    <div className="h-dvh flex bg-bg text-fg">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-[210px] shrink-0 border-r border-line bg-panel/40 brushed px-3 py-5">
        <div className="flex items-center gap-2 px-2 mb-6">
          <CassetteTape className="w-5 h-5 text-gold" />
          <span className="font-display font-bold text-[17px] tracking-tight">Reel</span>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ screen: s, label, icon: Icon }) => (
            <button
              key={s}
              type="button"
              onClick={() => dispatch({ type: "setScreen", screen: s })}
              className={cn(
                "flex items-center gap-2.5 px-2.5 h-9 rounded-md text-[13px] transition-colors",
                state.screen === s
                  ? "bg-panel border border-line text-fg"
                  : "text-dim/70 hover:text-fg border border-transparent",
              )}
            >
              <Icon className="w-4 h-4" strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <main className="flex-1 min-h-0 overflow-hidden">{screen}</main>
        <PlayerBar />
        {/* Mobile tab bar */}
        <nav className="md:hidden flex border-t border-line bg-panel brushed">
          {NAV.map(({ screen: s, label, icon: Icon }) => (
            <button
              key={s}
              type="button"
              onClick={() => dispatch({ type: "setScreen", screen: s })}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 py-2.5 text-[10.5px] transition-colors",
                state.screen === s ? "text-gold" : "text-dim/60",
              )}
            >
              <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </nav>
      </div>

      <ZenPlayer />
    </div>
  );
}
