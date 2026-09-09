import { useMutation } from "@tanstack/react-query";
import { cn } from "cn";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "../components/EmptyState";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { useLibraries } from "../hooks/useLibraries";
import { errorMessage, rescan } from "../lib/api";

export function SettingsScreen() {
  const libraries = useLibraries();
  const libs = libraries.data?.libraries ?? [];

  const doRescan = useMutation({
    mutationFn: rescan,
    onSuccess: () => toast.success("Rescan started"),
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[720px] w-full mx-auto px-5 md:px-8 pt-6 md:pt-8 pb-10">
        <h1 className="font-display font-bold text-[26px] md:text-[30px] tracking-tight">
          Settings
        </h1>
        <p className="text-[12px] text-dim/50 mt-1 mb-6">
          Libraries are the folders mounted into this container.
        </p>

        <section>
          <h2 className="font-mono text-[10.5px] tracking-[.18em] uppercase text-dim/50 mb-3">
            Libraries
          </h2>
          {libraries.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : libs.length === 0 ? (
            <EmptyState
              icon={RefreshCw}
              title="No libraries found"
              hint="Mount audio folders into /library and restart the container."
            />
          ) : (
            <div className="rounded-xl border border-line bg-panel brushed divide-y divide-line">
              {libs.map((l) => (
                <div key={l.path} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-medium truncate">{l.name}</div>
                    <div className="font-mono text-[11px] text-dim/50 truncate mt-0.5">
                      {l.audioFiles} files · {l.path}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="font-mono text-[10.5px] tracking-[.18em] uppercase text-dim/50 mb-3">
            Index
          </h2>
          <div className="rounded-xl border border-line bg-panel brushed px-4 py-3.5 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-medium">Rescan libraries</div>
              <div className="text-[12px] text-dim/50 mt-0.5">
                Re-walk the mounted folders and refresh durations. The file watcher also picks up
                changes automatically.
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => doRescan.mutate()}
              disabled={doRescan.isPending}
              className={cn("gap-1.5", doRescan.isPending && "pointer-events-none")}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", doRescan.isPending && "animate-spin")} />
              Rescan
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
