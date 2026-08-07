import { Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tag } from "@/components/common/status-badge";
import { AccessLevelTag, IngestionBadge, SourceBadge } from "@/components/video/source-badge";
import {
  useDeleteVideoAsset,
  useUpdateVideoAsset,
  type VideoAssetRecord,
} from "@/lib/data/video-queries";
import { formatDuration } from "@/lib/format";
import { formatFileSize } from "@/lib/video/upload";
import { cn } from "@/lib/utils";

/** Attached film for a game: switch angle, promote to primary, remove. */
export function FilmSourceList({
  assets,
  activeId,
  onSelect,
}: {
  assets: VideoAssetRecord[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const updateAsset = useUpdateVideoAsset();
  const deleteAsset = useDeleteVideoAsset();

  if (assets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No film attached yet. Add an upload, a YouTube link or a Hudl link below.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {assets.map((asset) => (
        <li
          key={asset.id}
          className={cn(
            "rounded-lg border px-3 py-2.5 transition-colors",
            asset.id === activeId ? "border-primary/50 bg-primary/5" : "border-border bg-surface-2",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={() => onSelect(asset.id)}
              className="min-w-0 flex-1 text-left"
            >
              <p className="truncate text-sm font-medium">{asset.label}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <SourceBadge provider={asset.provider} />
                <IngestionBadge status={asset.ingestion_status} />
                <AccessLevelTag accessLevel={asset.access_level} />
                {asset.is_primary ? <Tag>Primary</Tag> : null}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {[
                  asset.duration ? formatDuration(asset.duration) : null,
                  asset.file_size ? formatFileSize(asset.file_size) : null,
                  asset.original_filename,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Linked source"}
              </p>
              {asset.error ? <p className="mt-1 text-xs text-destructive">{asset.error}</p> : null}
            </button>
            <div className="flex shrink-0 items-center">
              {!asset.is_primary ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Make primary angle"
                  onClick={() =>
                    updateAsset.mutate(
                      { id: asset.id, patch: { is_primary: true } },
                      { onSuccess: () => toast.success("Primary angle updated.") },
                    )
                  }
                >
                  <Star className="size-4" />
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove film source"
                onClick={() =>
                  deleteAsset.mutate(
                    { id: asset.id, storage_path: asset.storage_path },
                    { onSuccess: () => toast.success("Film source removed.") },
                  )
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}