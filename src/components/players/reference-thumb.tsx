import { Film, ImageOff, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tag } from "@/components/common/status-badge";
import {
  useReferenceUrl,
  type ReferenceMediaRecord,
} from "@/lib/data/identity-queries";
import { REFERENCE_TYPE_LABELS, VIDEO_REFERENCE_TYPES } from "@/lib/identity/identity";

export function ReferenceThumb({
  reference,
  onDelete,
}: {
  reference: ReferenceMediaRecord;
  onDelete?: (reference: ReferenceMediaRecord) => void;
}) {
  const { data: url } = useReferenceUrl(reference);
  const isVideo =
    VIDEO_REFERENCE_TYPES.includes(reference.reference_type) ||
    (reference.mime_type ?? "").startsWith("video/");

  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative aspect-square bg-surface-2">
        {url && isVideo ? (
          <video src={url} controls className="size-full object-cover" preload="metadata" />
        ) : url ? (
          <img
            src={url}
            alt={`${REFERENCE_TYPE_LABELS[reference.reference_type]} reference`}
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <div className="grid size-full place-items-center text-muted-foreground">
            {isVideo ? <Film className="size-6" /> : <ImageOff className="size-6" />}
          </div>
        )}
      </div>
      <figcaption className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="min-w-0">
          <Tag>{REFERENCE_TYPE_LABELS[reference.reference_type]}</Tag>
          {reference.notes ? (
            <span className="mt-1 block truncate text-xs text-muted-foreground">
              {reference.notes}
            </span>
          ) : null}
        </span>
        {onDelete ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Remove reference"
            onClick={() => onDelete(reference)}
          >
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </figcaption>
    </figure>
  );
}