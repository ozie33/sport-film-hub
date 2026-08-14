import { Brain } from "lucide-react";
import { toast } from "sonner";

import { SectionCard } from "@/components/common/stat-card";
import { Tag } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { AI_SCOPE_DISCLAIMER, reviewedPlaysLabel } from "@/lib/ai/review-ai";
import { useDevelopmentSummary, useGenerateDevelopmentSummary } from "@/lib/data/ai-queries";

/** Cross-game development summary, generated from marked plays only. */
export function DevelopmentSummaryCard({
  playerId,
  playerName,
  clipCount,
}: {
  playerId: string;
  playerName: string;
  clipCount: number;
}) {
  const { data: report } = useDevelopmentSummary(playerId);
  const generate = useGenerateDevelopmentSummary();
  const summary = report?.content ?? null;

  function run() {
    generate.mutate(
      { playerId },
      {
        onSuccess: (result) =>
          toast.success(`AI summarized ${reviewedPlaysLabel(result.reviewedClipCount)}`),
        onError: (error) => toast.error(error.message),
      },
    );
  }

  return (
    <SectionCard
      title="AI Development Summary"
      description={`${playerName} — built from every play you marked`}
      actions={
        <Button
          size="sm"
          variant={summary ? "outline" : "default"}
          onClick={run}
          disabled={generate.isPending || clipCount === 0}
        >
          <Brain className="size-4" />
          {generate.isPending ? "Thinking…" : summary ? "Regenerate" : "Generate summary"}
        </Button>
      }
    >
      {clipCount === 0 ? (
        <p className="text-sm text-muted-foreground">
          Mark plays for {playerName} first. The AI summarizes your review — it does not watch film.
        </p>
      ) : !summary ? (
        <p className="text-sm text-muted-foreground">
          {reviewedPlaysLabel(clipCount)} ready. {AI_SCOPE_DISCLAIMER}
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{summary.summary}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface-2 p-3">
              <p className="label-caps text-[10px] text-muted-foreground">Top strength</p>
              <p className="mt-1 text-sm font-medium">{summary.topStrength}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface-2 p-3">
              <p className="label-caps text-[10px] text-muted-foreground">Biggest priority</p>
              <p className="mt-1 text-sm font-medium">{summary.biggestPriority}</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <List title="Patterns observed" items={summary.patternsObserved ?? []} />
            <List title="Film to review" items={summary.recommendedFilmReview ?? []} />
            <List title="Workout focus" items={summary.suggestedWorkoutFocus ?? []} />
          </div>
          <p className="text-xs text-muted-foreground">
            AI summary of {reviewedPlaysLabel(report?.reviewed_clip_count ?? clipCount)}.{" "}
            {AI_SCOPE_DISCLAIMER}
          </p>
          <Tag>AI generated from your review</Tag>
        </div>
      )}
    </SectionCard>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="label-caps text-[10px] text-muted-foreground">{title}</p>
      <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}