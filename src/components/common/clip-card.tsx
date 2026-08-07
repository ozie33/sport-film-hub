import { Film } from "lucide-react";

import { Tag } from "@/components/common/status-badge";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ClipCard({
  playerName,
  category,
  gameTitle,
  timestamp,
  score,
  className,
}: {
  playerName: string;
  category: string;
  gameTitle: string;
  timestamp: number;
  score?: number;
  className?: string;
}) {
  return (
    <article className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      <div className="field-grid flex aspect-video items-center justify-center bg-surface-2">
        <Film className="size-7 text-muted-foreground" />
      </div>
      <div className="space-y-1.5 p-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <p className="truncate text-sm font-semibold">{playerName}</p>
          {typeof score === "number" ? (
            <span
              className={cn(
                "label-caps shrink-0 rounded-md px-1.5 py-0.5 text-[11px] tabular-nums",
                score >= 7
                  ? "bg-success/15 text-success"
                  : score >= 5
                    ? "bg-warning/15 text-warning"
                    : "bg-destructive/15 text-destructive",
              )}
            >
              {score.toFixed(1)}
            </span>
          ) : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">{category}</p>
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <Tag>{gameTitle}</Tag>
          <Tag>{formatClock(timestamp)}</Tag>
        </div>
      </div>
    </article>
  );
}
