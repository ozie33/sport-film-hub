import { Link } from "@tanstack/react-router";
import { Sparkles, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SectionCard } from "@/components/common/stat-card";
import { Tag } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { AI_SCOPE_DISCLAIMER, reviewedPlaysLabel, type OrganizeResult } from "@/lib/ai/review-ai";
import { usePlaylists, useOrganizeReview } from "@/lib/data/ai-queries";

/**
 * Post-processing on top of an existing review: the AI reads the plays a human
 * already marked and groups them. It never watches film.
 */
export function OrganizeReviewCard({
  gameId,
  playerId,
  clipCount,
}: {
  gameId?: string | null;
  playerId?: string | null;
  clipCount: number;
}) {
  const organize = useOrganizeReview();
  const { data: playlists = [] } = usePlaylists({ gameId: gameId ?? null, aiOnly: true });
  const [result, setResult] = useState<OrganizeResult | null>(null);

  const existing = result?.playlists ?? null;

  function run() {
    organize.mutate(
      { gameId: gameId ?? null, playerId: playerId ?? null },
      {
        onSuccess: (data) => {
          setResult(data);
          if (data.playlists.length === 0) toast.error("The AI could not group these plays.");
          else
            toast.success(
              `AI organized ${reviewedPlaysLabel(data.reviewedClipCount)} into ${data.playlists.length} playlists`,
            );
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  return (
    <SectionCard
      title="Organize My Review"
      description="AI groups the plays you marked into review-ready playlists"
      actions={
        <Button size="sm" onClick={run} disabled={organize.isPending || clipCount === 0}>
          <Wand2 className="size-4" />
          {organize.isPending ? "Organizing…" : "Organize my review"}
        </Button>
      }
    >
      {clipCount === 0 ? (
        <p className="text-sm text-muted-foreground">
          Mark a few plays first — the AI organizes your review, it does not watch the film.
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {reviewedPlaysLabel(clipCount)} available. {AI_SCOPE_DISCLAIMER}
          </p>

          {result ? (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="size-4 text-primary" />
                AI organized {reviewedPlaysLabel(result.reviewedClipCount)} into{" "}
                {result.playlists.length} playlists
              </p>
              {result.themes.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {result.themes.map((theme) => (
                    <Tag key={theme}>{theme}</Tag>
                  ))}
                </div>
              ) : null}
              {result.tagNormalizations.length > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Tags cleaned up:{" "}
                  {result.tagNormalizations
                    .map((entry) => `${entry.from} → ${entry.to}`)
                    .join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}

          <ul className="space-y-1.5">
            {(existing ?? playlists).map((playlist) => (
              <li
                key={playlist.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{playlist.name}</p>
                  {playlist.description ? (
                    <p className="truncate text-xs text-muted-foreground">{playlist.description}</p>
                  ) : null}
                </div>
                <Tag>AI organized</Tag>
              </li>
            ))}
          </ul>

          {(existing ?? playlists).length > 0 ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/film-room">Watch in Film Room</Link>
            </Button>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}