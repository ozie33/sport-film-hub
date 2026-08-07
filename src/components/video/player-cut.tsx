import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Repeat } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { FilmPlayer, type FilmSource } from "@/components/video/film-player";
import { SourceBadge } from "@/components/video/source-badge";
import type { FilmPlayerHandle } from "@/components/video/film-player-types";
import type { ClipRecord } from "@/lib/data/video-queries";
import { capabilitiesFor } from "@/lib/video/capabilities";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Player Cut: plays a playlist of timestamp-range clips back to back.
 * Nothing is stitched server-side — we seek the original source per clip.
 */
export function PlayerCut({ clips }: { clips: ClipRecord[] }) {
  const playerRef = useRef<FilmPlayerHandle | null>(null);
  const [index, setIndex] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(true);

  const playable = useMemo(
    () =>
      clips.filter((clip) =>
        capabilitiesFor(clip.video_assets?.provider, clip.video_assets?.access_level)
          .timestamp_seeking,
      ),
    [clips],
  );

  useEffect(() => {
    setIndex(0);
  }, [playable.length]);

  const current = playable[index];
  const asset = (current?.video_assets ?? null) as FilmSource | null;

  // Seek to the clip's in-point whenever the active clip changes.
  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(() => {
      if (playerRef.current?.isReady()) {
        playerRef.current.seek(current.start_time);
        playerRef.current.play();
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [current]);

  function handleTimeUpdate(seconds: number) {
    if (!current) return;
    const end = current.end_time ?? current.start_time + 8;
    if (seconds >= end) {
      if (autoAdvance && index < playable.length - 1) setIndex(index + 1);
      else playerRef.current?.pause();
    }
  }

  if (playable.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center">
        <p className="text-sm font-medium">No in-app playback for this playlist</p>
        <p className="mt-1 text-sm text-muted-foreground">
          These clips come from link-only sources, so watch them with the provider. Uploads and
          YouTube links play here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <FilmPlayer
        key={asset?.id ?? "none"}
        ref={playerRef}
        asset={asset}
        startSeconds={current?.start_time ?? 0}
        onTimeUpdate={handleTimeUpdate}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous clip"
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next clip"
            disabled={index >= playable.length - 1}
            onClick={() => setIndex(index + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {current?.title ?? "Clip"}{" "}
              <span className="text-muted-foreground">
                · {index + 1} of {playable.length}
              </span>
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatClock(current?.start_time ?? 0)} –{" "}
              {formatClock(current?.end_time ?? (current?.start_time ?? 0) + 8)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {asset ? <SourceBadge provider={asset.provider} /> : null}
          <Label htmlFor="auto-advance" className="flex items-center gap-2 text-xs">
            <Repeat className="size-3.5" /> Auto advance
          </Label>
          <Switch id="auto-advance" checked={autoAdvance} onCheckedChange={setAutoAdvance} />
        </div>
      </div>

      <ol className="grid gap-1.5">
        {playable.map((clip, clipIndex) => (
          <li key={clip.id}>
            <button
              type="button"
              onClick={() => setIndex(clipIndex)}
              className={cn(
                "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                clipIndex === index
                  ? "border-primary/50 bg-primary/10"
                  : "border-border bg-surface-2 hover:border-primary/30",
              )}
            >
              <span className="label-caps text-[10px] tabular-nums text-muted-foreground">
                {formatClock(clip.start_time)}
              </span>
              <span className="truncate">{clip.title ?? clip.category ?? "Clip"}</span>
              <span className="text-xs text-muted-foreground">
                {clip.games?.title ?? ""}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}