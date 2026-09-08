import { Skeleton } from "./ui/skeleton";

export function SkeletonRows({ count = 8 }: { count?: number }) {
  return (
    <div className="px-2 py-2">
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows have no identity
        <div key={i} className="flex items-center gap-3 px-3 h-[52px]">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-3 w-10" />
        </div>
      ))}
    </div>
  );
}
