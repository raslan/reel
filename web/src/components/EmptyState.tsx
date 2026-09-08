import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  hint?: string;
}

export function EmptyState({ icon: Icon, title, hint }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <Icon className="w-7 h-7 text-dim/40" strokeWidth={1.5} />
      <div className="text-[14px] text-dim/70">{title}</div>
      {hint ? <div className="text-[12px] text-dim/40 max-w-[320px]">{hint}</div> : null}
    </div>
  );
}
