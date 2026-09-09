import { useMutation } from "@tanstack/react-query";
import { cn } from "cn";
import { RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { clearDb, errorMessage, rescan } from "../lib/api";

export function SettingsScreen() {
  const doRescan = useMutation({
    mutationFn: rescan,
    onSuccess: () => toast.success("Rescan started"),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const doClear = useMutation({
    mutationFn: clearDb,
    onSuccess: () => toast.success("Library cleared"),
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
            Index
          </h2>
          <div className="rounded-xl border border-line bg-panel brushed divide-y divide-line">
            <div className="px-4 py-3.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-medium">Rescan libraries</div>
                <div className="text-[12px] text-dim/50 mt-0.5">
                  Re-walk the mounted folders and refresh durations. This is how new or changed
                  files are picked up.
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
            <div className="px-4 py-3.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-medium">Clear library</div>
                <div className="text-[12px] text-dim/50 mt-0.5">
                  Wipes the index, favorites, and cached peaks — as if the library never existed.
                  Files on disk are untouched; rescan to rebuild.
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (
                    !window.confirm(
                      "Clear the library? The index, favorites, and cached peaks are removed. Your files on disk are untouched.",
                    )
                  )
                    return;
                  doClear.mutate();
                }}
                disabled={doClear.isPending}
                className={cn("gap-1.5", doClear.isPending && "pointer-events-none")}
              >
                <Trash2 className={cn("w-3.5 h-3.5", doClear.isPending && "animate-pulse")} />
                Clear
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
