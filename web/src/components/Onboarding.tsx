import { CassetteTape } from "lucide-react";
import { useState } from "react";
import { useLibraries } from "../hooks/useLibraries";
import { setLibraries } from "../lib/api";
import { setOnboarded } from "../lib/storage";
import { useAppDispatch } from "../state/context";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { Switch } from "./ui/switch";

export function Onboarding() {
  const dispatch = useAppDispatch();
  const libraries = useLibraries();
  const libs = libraries.data?.libraries ?? [];
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);

  const toggle = (path: string) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const finish = async () => {
    setBusy(true);
    try {
      await setLibraries([...enabled]);
      setOnboarded();
      dispatch({ type: "setScreen", screen: "library" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-bg flex items-center justify-center px-5">
      <div className="w-full max-w-[440px] rounded-xl border border-line bg-panel brushed p-6 md:p-8">
        <div className="flex items-center gap-2.5 mb-5">
          <CassetteTape className="w-6 h-6 text-gold" />
          <span className="font-display font-bold text-[20px] tracking-tight">Reel</span>
        </div>
        <h1 className="text-[15px] font-semibold">Choose your libraries</h1>
        <p className="text-[12.5px] text-dim/60 mt-1 mb-5">
          These are the folders mounted into this container. You can change them any time in
          Settings.
        </p>
        {libraries.isPending ? (
          <div className="space-y-2 mb-6">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : libs.length === 0 ? (
          <div className="text-[13px] text-dim/60 mb-6">
            No libraries found. Mount audio folders into /library and restart.
          </div>
        ) : (
          <div className="space-y-2 mb-6">
            {libs.map((l) => (
              <div
                key={l.path}
                className="flex items-center gap-3 rounded-lg border border-line px-3.5 py-3 hover:border-gold/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-medium truncate">{l.name}</div>
                  <div className="font-mono text-[11px] text-dim/50 truncate mt-0.5">
                    {l.audioFiles} files
                  </div>
                </div>
                <Switch
                  checked={enabled.has(l.path)}
                  onCheckedChange={() => toggle(l.path)}
                  aria-label={`Enable ${l.name}`}
                />
              </div>
            ))}
          </div>
        )}
        <Button
          className="w-full"
          onClick={() => void finish()}
          disabled={busy || libraries.isPending}
        >
          {busy ? "Starting..." : "Start listening"}
        </Button>
      </div>
    </div>
  );
}
