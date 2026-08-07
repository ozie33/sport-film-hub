import { Play, Pause, SkipBack, SkipForward, Film } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PLAYBACK_SPEEDS } from "@/lib/domain";
import { cn } from "@/lib/utils";

export function VideoPlaceholder({
  title,
  subtitle,
  showSpeeds = true,
  className,
}: {
  title?: string;
  subtitle?: string;
  showSpeeds?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      <div className="field-grid relative flex aspect-video w-full items-center justify-center bg-surface-2">
        <div className="text-center">
          <Film className="mx-auto size-10 text-muted-foreground" />
          <p className="label-caps mt-3 text-xs text-muted-foreground">Video player placeholder</p>
          {title ? <p className="mt-1 text-sm font-medium">{title}</p> : null}
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" disabled aria-label="Previous clip">
            <SkipBack className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" disabled aria-label="Play">
            <Play className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" disabled aria-label="Pause">
            <Pause className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" disabled aria-label="Next clip">
            <SkipForward className="size-4" />
          </Button>
        </div>
        {showSpeeds ? (
          <div className="flex flex-wrap items-center gap-1">
            <span className="label-caps mr-1 text-[10px] text-muted-foreground">Speed</span>
            {PLAYBACK_SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                disabled
                className={cn(
                  "rounded-md border px-2 py-0.5 text-xs tabular-nums",
                  speed === 1
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground",
                )}
              >
                {speed}x
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
