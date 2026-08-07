import { FlaskConical } from "lucide-react";

import { cn } from "@/lib/utils";

export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "label-caps inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] text-primary",
        className,
      )}
    >
      <FlaskConical className="size-3" />
      Demo data
    </span>
  );
}

export function DemoNotice({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
      <DemoBadge />
      <span>
        {children ??
          "These are sample values for previewing the interface, not real analysis results."}
      </span>
    </div>
  );
}
