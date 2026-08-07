import { Link } from "@tanstack/react-router";
import { Inbox, Share2 } from "lucide-react";

import { SectionCard } from "@/components/common/stat-card";
import { Tag } from "@/components/common/status-badge";
import { SHARE_TYPE_LABELS, useSharedWithMe } from "@/lib/data/share-queries";
import { formatDateLabel } from "@/lib/format";

/** Film a coach sent this user, opened with the same provider-aware player. */
export function SharedWithMe({ compact = false }: { compact?: boolean }) {
  const { data = [], isPending } = useSharedWithMe();

  if (isPending || data.length === 0) return null;

  return (
    <SectionCard
      title="Shared with me"
      description={`${data.length} item${data.length === 1 ? "" : "s"} shared with you`}
    >
      <ul className="space-y-2">
        {data.slice(0, compact ? 3 : data.length).map((share) => (
          <li key={share.id}>
            <Link
              to="/games/$gameId"
              params={{ gameId: share.resource_id }}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5 transition-colors hover:border-primary/50"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-muted text-muted-foreground">
                {share.viewed_at ? <Inbox className="size-4" /> : <Share2 className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {SHARE_TYPE_LABELS[share.resource_type]}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {share.note ?? `Shared ${formatDateLabel(share.created_at)}`}
                </span>
              </span>
              <Tag>{share.permission}</Tag>
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
