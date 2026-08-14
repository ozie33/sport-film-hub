import { BookOpen } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

import { SectionCard } from "@/components/common/stat-card";
import { Tag } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { AI_SCOPE_DISCLAIMER, reviewedPlaysLabel } from "@/lib/ai/review-ai";
import { useGameStory, useGenerateGameStory } from "@/lib/data/ai-queries";
import { PRODUCT_EVENTS } from "@/lib/analytics/events";
import { trackEvent } from "@/lib/analytics/track";

/** Narrative built from marked plays only — never described as watched film. */
export function GameStoryCard({ gameId, clipCount }: { gameId: string; clipCount: number }) {
  const { data: report } = useGameStory(gameId);
  const generate = useGenerateGameStory();
  const story = report?.content ?? null;

  // Counts as "viewed" only when there is a story on screen to read.
  useEffect(() => {
    if (!story) return;
    trackEvent(PRODUCT_EVENTS.gameStoryViewed, { gameId, oncePerSession: gameId });
  }, [story, gameId]);

  function run() {
    generate.mutate(
      { gameId },
      {
        onSuccess: (result) =>
          toast.success(`AI summarized ${reviewedPlaysLabel(result.reviewedClipCount)}`),
        onError: (error) => toast.error(error.message),
      },
    );
  }

  return (
    <SectionCard
      title="AI Game Story"
      description="A written summary of the plays you marked"
      actions={
        <Button
          size="sm"
          variant={story ? "outline" : "default"}
          onClick={run}
          disabled={generate.isPending || clipCount === 0}
        >
          <BookOpen className="size-4" />
          {generate.isPending ? "Writing…" : story ? "Regenerate" : "Generate game story"}
        </Button>
      }
    >
      {clipCount === 0 ? (
        <p className="text-sm text-muted-foreground">
          Mark plays to unlock the game story. The AI reads your review — it does not watch video.
        </p>
      ) : !story ? (
        <p className="text-sm text-muted-foreground">
          {reviewedPlaysLabel(clipCount)} ready to summarize. {AI_SCOPE_DISCLAIMER}
        </p>
      ) : (
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold uppercase">{story.headline}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{story.narrative}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              AI summary of {reviewedPlaysLabel(report?.reviewed_clip_count ?? clipCount)}.{" "}
              {AI_SCOPE_DISCLAIMER}
            </p>
          </div>

          {(story.counts ?? []).length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {story.counts.map((count) => (
                <div
                  key={count.label}
                  className="rounded-lg border border-border bg-surface-2 px-3 py-2"
                >
                  <p className="label-caps text-[10px] text-muted-foreground">{count.label}</p>
                  <p className="text-lg font-semibold tabular-nums">{count.value}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <StoryList title="Strengths shown" items={story.strengths ?? []} />
            <StoryList title="Development themes" items={story.developmentThemes ?? []} />
            <StoryList title="Decision patterns" items={story.decisionPatterns ?? []} />
            {story.suggestedPlaylist?.name ? (
              <div>
                <p className="label-caps text-[10px] text-muted-foreground">Suggested playlist</p>
                <p className="mt-1 text-sm font-medium">{story.suggestedPlaylist.name}</p>
                <p className="text-sm text-muted-foreground">
                  {story.suggestedPlaylist.description}
                </p>
              </div>
            ) : null}
          </div>

          <Tag>AI generated from your review</Tag>
        </div>
      )}
    </SectionCard>
  );
}

function StoryList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="label-caps text-[10px] text-muted-foreground">{title}</p>
      <ul className="mt-1 space-y-1 text-sm">
        {items.map((item) => (
          <li key={item} className="text-muted-foreground">
            • {item}
          </li>
        ))}
      </ul>
    </div>
  );
}