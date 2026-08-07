import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, Crosshair, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tag } from "@/components/common/status-badge";
import {
  MIN_IDENTITY_CONFIRMATIONS,
  TARGET_IDENTITY_CONFIRMATIONS,
} from "@/lib/analysis/analysis";
import {
  useCreateConfirmation,
  useDeleteConfirmation,
  useIdentityConfirmations,
  useSaveConfirmationAsGameCrop,
  type BoundingBox,
} from "@/lib/data/analysis-queries";
import { useDrivePlaybackUrl, useSignedFilmUrl } from "@/lib/data/video-queries";
import type { VideoAssetRecord } from "@/lib/data/video-queries";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";

export type IdentityContext = {
  team: string | null;
  jerseyNumber: string | null;
  position: string | null;
  season: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  photoCount: number;
  videoCount: number;
  cropCount: number;
  gameDate: string | null;
};

/** Click box size, as a fraction of the frame — roughly one athlete. */
const BOX_W = 0.09;
const BOX_H = 0.24;

/**
 * Pre-analysis player confirmation. The user verifies the game's identity
 * context, then points at their athlete in several frames. Those confirmations
 * are the strongest identity signal the tracker receives.
 */
export function IdentifyPlayerDialog({
  open,
  onOpenChange,
  gameId,
  playerId,
  playerName,
  asset,
  context,
  onStart,
  starting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gameId: string;
  playerId: string;
  playerName: string;
  asset: VideoAssetRecord;
  context: IdentityContext;
  onStart: () => void;
  starting: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [duration, setDuration] = useState(asset.duration ?? 0);
  const [frameIndex, setFrameIndex] = useState(0);
  const [contextConfirmed, setContextConfirmed] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const { data: signedUrl } = useSignedFilmUrl(
    asset.provider === "upload" ? asset.storage_path : null,
  );
  const { data: driveUrl } = useDrivePlaybackUrl(
    asset.provider === "google_drive" ? asset.id : null,
  );
  const src = asset.provider === "google_drive" ? driveUrl : signedUrl;

  const { data: confirmations = [] } = useIdentityConfirmations(gameId, playerId);
  const createConfirmation = useCreateConfirmation();
  const deleteConfirmation = useDeleteConfirmation();
  const saveCrop = useSaveConfirmationAsGameCrop();

  const frameTargets = useMemo(() => {
    const total = duration || 600;
    return [0.12, 0.28, 0.44, 0.6, 0.76].map((ratio) => Math.round(total * ratio));
  }, [duration]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    const target = frameTargets[frameIndex] ?? 0;
    const seek = () => {
      video.currentTime = target;
    };
    if (video.readyState >= 1) seek();
    else video.addEventListener("loadedmetadata", seek, { once: true });
  }, [frameIndex, frameTargets, src]);

  async function handleFrameClick(event: React.MouseEvent<HTMLDivElement>) {
    const video = videoRef.current;
    if (!video) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const box: BoundingBox = {
      x: Math.max(0, Math.min(1 - BOX_W, x - BOX_W / 2)),
      y: Math.max(0, Math.min(1 - BOX_H, y - BOX_H / 2)),
      w: BOX_W,
      h: BOX_H,
    };

    // Best-effort still of the frame; some sources block canvas reads.
    let frameDataUrl: string | null = null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frameDataUrl = canvas.toDataURL("image/png");
      }
    } catch {
      frameDataUrl = null;
    }

    setCapturing(true);
    try {
      await createConfirmation.mutateAsync({
        game_id: gameId,
        player_id: playerId,
        video_asset_id: asset.id,
        timestamp_seconds: Number(video.currentTime.toFixed(2)),
        bounding_box: box,
        frame_data_url: frameDataUrl,
      });
      toast.success("Player confirmed in this frame");
      if (frameIndex < frameTargets.length - 1) setFrameIndex(frameIndex + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save that confirmation");
    } finally {
      setCapturing(false);
    }
  }

  const enough = confirmations.length >= MIN_IDENTITY_CONFIRMATIONS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Identify your player</DialogTitle>
          <DialogDescription>
            Confirm the identity context for this game, then click {playerName} in a few frames.
            We use jersey number, uniform colors, body proportions and your confirmed frames —
            never face recognition alone.
          </DialogDescription>
        </DialogHeader>

        <section className="rounded-lg border border-border bg-surface-2 p-3">
          <p className="text-sm font-semibold">{playerName}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Tag>{context.team ?? "No team on this game"}</Tag>
            <Tag>{context.jerseyNumber ? `#${context.jerseyNumber}` : "No jersey number"}</Tag>
            <Tag>{context.position ?? "No position"}</Tag>
            {context.season ? <Tag>{context.season}</Tag> : null}
            <Tag>{context.photoCount} reference photos</Tag>
            <Tag>{context.videoCount} reference videos</Tag>
            <Tag>{context.cropCount} confirmed game crops</Tag>
            {context.primaryColor ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                Uniform
                <span
                  className="size-3 rounded-full border border-border"
                  style={{ backgroundColor: context.primaryColor }}
                />
                {context.secondaryColor ? (
                  <span
                    className="size-3 rounded-full border border-border"
                    style={{ backgroundColor: context.secondaryColor }}
                  />
                ) : null}
              </span>
            ) : null}
          </div>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <Checkbox
              checked={contextConfirmed}
              onCheckedChange={(value) => setContextConfirmed(value === true)}
            />
            <span>This team, jersey number and uniform information is correct for this game.</span>
          </label>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {frameTargets.map((target, index) => (
                <Button
                  key={target}
                  size="sm"
                  variant={index === frameIndex ? "default" : "outline"}
                  onClick={() => setFrameIndex(index)}
                >
                  Frame {index + 1} · {formatClock(target)}
                </Button>
              ))}
            </div>

            {src ? (
              <div
                role="button"
                tabIndex={0}
                onClick={handleFrameClick}
                onKeyDown={() => {}}
                className="relative cursor-crosshair overflow-hidden rounded-xl border border-border bg-black"
                aria-label="Click your player in this frame"
              >
                <video
                  ref={videoRef}
                  src={src}
                  crossOrigin="anonymous"
                  preload="metadata"
                  playsInline
                  muted
                  className="aspect-video w-full"
                  onLoadedMetadata={(event) =>
                    setDuration(Math.round(event.currentTarget.duration || 0))
                  }
                />
                {capturing ? (
                  <span className="absolute inset-0 grid place-items-center bg-background/60">
                    <Loader2 className="size-6 animate-spin text-primary" />
                  </span>
                ) : null}
                <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-md bg-background/85 px-2 py-1 text-[11px]">
                  <Crosshair className="size-3.5 text-primary" /> Click your player
                </span>
              </div>
            ) : (
              <div className="grid aspect-video place-items-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                Preparing film…
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">
              Confirmations{" "}
              <span className="text-muted-foreground">
                {confirmations.length} of {TARGET_IDENTITY_CONFIRMATIONS}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {MIN_IDENTITY_CONFIRMATIONS} minimum. More confirmations across the game make tracking
              far more reliable.
            </p>
            <ul className="space-y-1.5">
              {confirmations.map((confirmation) => (
                <li
                  key={confirmation.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm"
                >
                  <span className="tabular-nums">
                    {formatClock(confirmation.timestamp_seconds)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Save as game crop"
                    disabled={
                      !confirmation.frame_image_path || Boolean(confirmation.saved_to_reference_id)
                    }
                    onClick={() =>
                      saveCrop.mutate(
                        {
                          confirmation,
                          context: {
                            team: context.team,
                            jersey_number: context.jerseyNumber,
                            uniform_primary_color: context.primaryColor,
                            game_date: context.gameDate,
                          },
                        },
                        {
                          onSuccess: () => toast.success("Saved to Reference Library"),
                          onError: (error) =>
                            toast.error(
                              error instanceof Error ? error.message : "Could not save crop",
                            ),
                        },
                      )
                    }
                  >
                    {confirmation.saved_to_reference_id ? (
                      <Check className="size-4 text-success" />
                    ) : (
                      <Camera className="size-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove confirmation"
                    onClick={() => deleteConfirmation.mutate(confirmation)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
              {confirmations.length === 0 ? (
                <li className="rounded-lg border border-dashed border-border px-2 py-3 text-xs text-muted-foreground">
                  No confirmations yet.
                </li>
              ) : null}
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!contextConfirmed || !enough || starting}
            onClick={onStart}
            className={cn(starting && "opacity-80")}
          >
            {starting ? <Loader2 className="size-4 animate-spin" /> : null}
            Start analysis
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
