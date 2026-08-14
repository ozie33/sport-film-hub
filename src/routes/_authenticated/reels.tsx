import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Scissors, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/stat-card";
import { Tag } from "@/components/common/status-badge";
import { ReelBuilderDialog } from "@/components/reels/reel-builder-dialog";
import { ShareWithPlayerDialog } from "@/components/sharing/share-with-player-dialog";
import { Button } from "@/components/ui/button";
import { PlayerCut } from "@/components/video/player-cut";
import {
  AI_SCOPE_DISCLAIMER,
  REEL_MODE_LABELS,
  REGENERATE_OPTIONS,
  reviewedPlaysLabel,
} from "@/lib/ai/review-ai";
import {
  useBuildReel,
  useDeleteReel,
  useReelClips,
  useReels,
  useRemoveReelClip,
  useReorderReelClips,
} from "@/lib/data/ai-queries";
import { formatClock, fullName } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reels")({
  head: () => ({
    meta: [
      { title: "Reels — CourtBase" },
      {
        name: "description",
        content: "Recruiting and highlight reels built from your best clips. Coming in a later phase.",
      },
      { property: "og:title", content: "Reels — CourtBase" },
      { property: "og:description", content: "Recruiting and highlight reels built from your best clips." },
    ],
  }),
  component: ReelsPage,
});

function ReelsPage() {
  const { data: reels = [], isLoading } = useReels();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId && reels.length > 0) setSelectedId(reels[0]!.id);
  }, [reels, selectedId]);

  const selected = reels.find((reel) => reel.id === selectedId) ?? null;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Reels"
        title="Reels"
        description="AI-sequenced reels built from the plays you marked, then edited by you."
        actions={<ReelBuilderDialog onCreated={setSelectedId} />}
      />

      {reels.length === 0 ? (
        <EmptyState
          icon={<Scissors className="size-8" />}
          title={isLoading ? "Loading reels…" : "No reels yet"}
          description="Mark plays on a game, then let the AI sequence them into a recruiting, scoring, defense or development reel. You can reorder and remove plays afterwards."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
          <SectionCard title="Your reels" description={`${reels.length} saved`}>
            <ul className="space-y-1.5">
              {reels.map((reel) => (
                <li key={reel.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(reel.id)}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      reel.id === selectedId
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="block truncate font-medium">{reel.title}</span>
                    <span className="block truncate text-xs">
                      {REEL_MODE_LABELS[reel.reel_type] ?? reel.reel_type}
                      {reel.version > 1 ? ` · v${reel.version}` : ""}
                      {reel.players
                        ? ` · ${fullName(reel.players.first_name, reel.players.last_name)}`
                        : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </SectionCard>

          {selected ? <ReelEditor reelId={selected.id} /> : null}
        </div>
      )}
    </AppShell>
  );
}

function ReelEditor({ reelId }: { reelId: string }) {
  const { data: reels = [] } = useReels();
  const reel = reels.find((row) => row.id === reelId);
  const { data: entries = [] } = useReelClips(reelId);
  const reorder = useReorderReelClips();
  const removeClip = useRemoveReelClip();
  const deleteReel = useDeleteReel();
  const rebuild = useBuildReel();
  const [adjustments, setAdjustments] = useState<string[]>([]);

  if (!reel) return null;

  function move(index: number, direction: -1 | 1) {
    const next = [...entries];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    reorder.mutate({ reelId, orderedIds: next.map((entry) => entry.id) });
  }

  function regenerate() {
    rebuild.mutate(
      {
        mode: reel!.reel_type,
        playerId: reel!.player_id,
        gameIds: reel!.source_game_ids,
        customPrompt: reel!.generation_prompt,
        adjustments,
        parentReelId: reel!.id,
      },
      {
        onSuccess: (result) => {
          toast.success(`New version created with ${result.clipCount} plays`);
          setAdjustments([]);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title={reel.title}
        description={reel.summary ?? "AI-sequenced from your marked plays"}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Tag>{REEL_MODE_LABELS[reel.reel_type] ?? reel.reel_type}</Tag>
            <Tag>v{reel.version}</Tag>
            <ShareWithPlayerDialog
              resourceType="reel"
              resourceId={reel.id}
              resourceName={reel.title}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => deleteReel.mutate(reel.id)}
              disabled={deleteReel.isPending}
            >
              <Trash2 className="size-4" /> Delete
            </Button>
          </div>
        }
      >
        <p className="mb-3 text-xs text-muted-foreground">
          AI sequenced {entries.length} of {reviewedPlaysLabel(reel.reviewed_clip_count)}.{" "}
          {AI_SCOPE_DISCLAIMER}
        </p>
        <PlayerCut clips={entries.map((entry) => entry.clip)} />
      </SectionCard>

      <SectionCard
        title="Sequence"
        description="Reorder or remove plays — your edits always override the AI"
      >
        <ol className="space-y-1.5">
          {entries.map((entry, index) => (
            <li
              key={entry.id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
            >
              <span className="label-caps text-[10px] tabular-nums text-muted-foreground">
                {index + 1} · {formatClock(entry.clip.start_time)}
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {entry.clip.title ?? entry.clip.category ?? "Clip"}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {entry.clip.games?.title ?? ""}
                  </span>
                </p>
                {entry.ai_reason ? (
                  <p className="truncate text-xs text-muted-foreground">AI: {entry.ai_reason}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Move up"
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Move down"
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remove clip"
                  onClick={() => removeClip.mutate({ id: entry.id, reelId })}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      </SectionCard>

      <SectionCard
        title="Regenerate"
        description="Ask for a different cut — the current version is kept"
        actions={
          <Button size="sm" onClick={regenerate} disabled={rebuild.isPending}>
            <Sparkles className="size-4" />
            {rebuild.isPending ? "Rebuilding…" : "Create new version"}
          </Button>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {REGENERATE_OPTIONS.map((option) => (
            <Button
              key={option.key}
              size="sm"
              variant={adjustments.includes(option.label) ? "default" : "outline"}
              onClick={() =>
                setAdjustments((current) =>
                  current.includes(option.label)
                    ? current.filter((value) => value !== option.label)
                    : [...current, option.label],
                )
              }
            >
              {option.label}
            </Button>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
