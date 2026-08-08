import { Link } from "@tanstack/react-router";
import { Brain, Film, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SectionCard } from "@/components/common/stat-card";
import { Tag } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { AnalysisProgress } from "@/components/analysis/analysis-progress";
import {
  IdentifyPlayerDialog,
  type IdentityContext,
} from "@/components/analysis/identify-player-dialog";
import { evaluateAnalysisEligibility, isActiveStatus } from "@/lib/analysis/analysis";
import { useAnalysisJobs, useStartAnalysis } from "@/lib/data/analysis-queries";
import { currentMembership, usePlayerMemberships, usePlayerReferences } from "@/lib/data/identity-queries";
import type { VideoAssetRecord } from "@/lib/data/video-queries";

/**
 * The Analyze Player entry point. Availability is decided by the video-source
 * capability matrix, never by provider name, and the reason is always shown.
 */
export function AnalyzePlayerCard({
  gameId,
  asset,
  player,
  gameContext,
}: {
  gameId: string;
  asset: VideoAssetRecord | null;
  player: { id: string; name: string } | null;
  gameContext: {
    team: string | null;
    jerseyNumber: string | null;
    position: string | null;
    season: string | null;
    primaryColor: string | null;
    secondaryColor: string | null;
    gameDate: string | null;
  };
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const { data: jobs = [] } = useAnalysisJobs(gameId);
  const { data: memberships = [] } = usePlayerMemberships(player?.id ?? null);
  const { data: references = [] } = usePlayerReferences(player?.id ?? null);
  const startAnalysis = useStartAnalysis();

  const membership = currentMembership(memberships);
  const photoCount = references.filter(
    (reference) =>
      reference.reference_type !== "reference_video" && reference.reference_type !== "game_crop",
  ).length;
  const videoCount = references.filter(
    (reference) => reference.reference_type === "reference_video",
  ).length;
  const cropCount = references.filter(
    (reference) => reference.reference_type === "game_crop",
  ).length;

  const jersey = gameContext.jerseyNumber ?? membership?.jersey_number ?? null;
  // Reference Library material is the only identity requirement. Jersey number,
  // team and uniform colours are optional confidence boosters.
  const identityReady = Boolean(player && photoCount + videoCount + cropCount >= 1);

  const eligibility = evaluateAnalysisEligibility({
    asset,
    hasPlayer: Boolean(player),
    identityReady,
  });

  const liveJob = jobs.find((job) => isActiveStatus(job.status)) ?? null;
  const currentJobId = activeJobId ?? liveJob?.id ?? null;
  const latestReady = jobs.find(
    (job) => job.status === "ready_for_review" || job.status === "completed",
  );

  const identityContext: IdentityContext = {
    team: gameContext.team,
    jerseyNumber: jersey,
    position: gameContext.position ?? membership?.position_label ?? null,
    season: gameContext.season ?? membership?.season ?? null,
    primaryColor: gameContext.primaryColor,
    secondaryColor: gameContext.secondaryColor,
    photoCount,
    videoCount,
    cropCount,
    gameDate: gameContext.gameDate,
  };

  function handleStart() {
    if (!player || !asset) return;
    startAnalysis.mutate(
      { gameId, videoAssetId: asset.id, playerId: player.id },
      {
        onSuccess: (jobId) => {
          setActiveJobId(jobId);
          setDialogOpen(false);
          toast.success("Analysis started");
        },
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Could not start analysis"),
      },
    );
  }

  return (
    <SectionCard
      title="AI Player Analysis"
      description="Identify the athlete, track them through the film and propose candidate clips."
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          {eligibility.filmReady ? <Tag>Film Ready</Tag> : null}
          <span
            className={
              eligibility.eligible
                ? "label-caps inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/15 px-2.5 py-0.5 text-[11px] text-success"
                : "label-caps inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground"
            }
          >
            <Sparkles className="size-3" />
            {eligibility.eligible ? "AI Analysis Available" : "AI Analysis Unavailable"}
          </span>
        </div>
      }
    >
      <div className="space-y-3">
        {eligibility.reason ? (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Film className="mt-0.5 size-4 shrink-0" />
            {eligibility.reason}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            We'll confirm your athlete in 3–5 frames from this game, learn their in-game
            appearance from those frames, then track them through the film.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={!eligibility.eligible || Boolean(liveJob)} onClick={() => setDialogOpen(true)}>
            <Brain className="size-4" />
            {jobs.length > 0 ? "Re-run analysis" : "Analyze Player"}
          </Button>
          {latestReady ? (
            <Button variant="outline" asChild>
              <Link to="/analysis/$jobId" params={{ jobId: latestReady.id }}>
                Open AI Review
              </Link>
            </Button>
          ) : null}
        </div>

        {currentJobId ? <AnalysisProgress jobId={currentJobId} /> : null}
      </div>

      {player && asset && dialogOpen ? (
        <IdentifyPlayerDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          gameId={gameId}
          playerId={player.id}
          playerName={player.name}
          asset={asset}
          context={identityContext}
          onStart={handleStart}
          starting={startAnalysis.isPending}
        />
      ) : null}
    </SectionCard>
  );
}
