import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Tag as TagIcon,
  TriangleAlert,
  UserX,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard, StatCard } from "@/components/common/stat-card";
import { Tag } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { FilmPlayer } from "@/components/video/film-player";
import { IdentifyPlayerDialog } from "@/components/analysis/identify-player-dialog";
import { AnalysisDiagnostics } from "@/components/analysis/analysis-diagnostics";
import type { FilmPlayerHandle } from "@/components/video/film-player-types";
import {
  candidateReasonLabel,
  CONFIDENCE_LABELS,
  confidenceTier,
  providerLabel,
  REVIEW_STATUS_LABELS,
} from "@/lib/analysis/analysis";
import {
  useAnalysisJob,
  useCandidateClips,
  useCreateConfirmation,
  usePlayerTracks,
  useReviewCandidate,
  type CandidateClipRecord,
} from "@/lib/data/analysis-queries";
import { useGame } from "@/lib/data/queries";
import { useVideoAssets } from "@/lib/data/video-queries";
import { teamDisplayName } from "@/lib/data/identity-queries";
import { formatClock, fullName } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/analysis/$jobId")({
  head: () => ({
    meta: [
      { title: "AI Review — CourtBase" },
      {
        name: "description",
        content: "Approve, reject or correct AI candidate clips for your athlete.",
      },
      { property: "og:title", content: "AI Review — CourtBase" },
      { property: "og:description", content: "Human review of AI candidate player clips." },
    ],
  }),
  errorComponent: () => (
    <AppShell>
      <EmptyState title="We couldn't load this analysis" description="Please refresh and try again." />
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <EmptyState title="Analysis not found" description="This run may have been deleted." />
    </AppShell>
  ),
  component: AiReview,
});

function AiReview() {
  const { jobId } = Route.useParams();
  const { data: job } = useAnalysisJob(jobId);
  const { data: candidates = [] } = useCandidateClips(jobId);
  const { data: tracks = [] } = usePlayerTracks(jobId);
  const { data: game } = useGame(job?.game_id ?? "");
  const { data: assets = [] } = useVideoAssets(job?.game_id);
  const review = useReviewCandidate();
  const createConfirmation = useCreateConfirmation();

  const playerRef = useRef<FilmPlayerHandle | null>(null);
  const [index, setIndex] = useState(0);
  const [inPoint, setInPoint] = useState<number | null>(null);
  const [outPoint, setOutPoint] = useState<number | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [wrongOpen, setWrongOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const current = candidates[index];
  const asset = assets.find((item) => item.id === job?.video_asset_id) ?? null;
  const reviewed = candidates.filter((item) => item.review_status !== "pending").length;
  const approved = candidates.filter(
    (item) => item.review_status === "approved" || item.review_status === "edited",
  ).length;
  const rejected = candidates.filter((item) => item.review_status === "rejected").length;
  const corrected = candidates.filter((item) => item.wrong_player).length;

  const start = inPoint ?? current?.start_time ?? 0;
  const end = outPoint ?? current?.end_time ?? 0;

  useEffect(() => {
    setInPoint(null);
    setOutPoint(null);
    setTagDraft("");
    setNoteDraft("");
  }, [current?.id]);

  // Seek to the candidate's in point whenever the active candidate changes.
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

  function goto(next: number) {
    setIndex(Math.max(0, Math.min(candidates.length - 1, next)));
  }

  function submit(decision: "approve" | "reject") {
    if (!current) return;
    review.mutate(
      {
        candidate: current,
        decision,
        startTime: start,
        endTime: end,
        ...(tagDraft.trim() ? { tags: [...current.tags, tagDraft.trim()] } : {}),
        ...(noteDraft.trim() ? { notes: noteDraft.trim() } : {}),
      },
      {
        onSuccess: (status) => {
          toast.success(
            decision === "approve"
              ? status === "edited"
                ? "Approved with your edited timestamps"
                : "Approved — added to Film Room"
              : "Rejected",
          );
          if (index < candidates.length - 1) goto(index + 1);
        },
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Could not save your decision"),
      },
    );
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const key = event.key.toLowerCase();
      if (key === "a") submit("approve");
      else if (key === "r") submit("reject");
      else if (key === "i") setInPoint(Number((playerRef.current?.getCurrentTime() ?? 0).toFixed(2)));
      else if (key === "o") setOutPoint(Number((playerRef.current?.getCurrentTime() ?? 0).toFixed(2)));
      else if (event.key === "ArrowRight") goto(index + 1);
      else if (event.key === "ArrowLeft") goto(index - 1);
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const trackingLostAt = job?.result_summary["tracking_lost_at"] as number | null | undefined;
  const needsConfirmation = tracks.some((track) => track.needs_confirmation);

  const identityContext = useMemo(
    () => ({
      team: game?.teams ? teamDisplayName(game.teams) : null,
      jerseyNumber: game?.jersey_number ?? null,
      position: null,
      season: game?.season ?? null,
      primaryColor: game?.uniform_primary_color ?? null,
      secondaryColor: game?.uniform_secondary_color ?? null,
      photoCount: 0,
      videoCount: 0,
      cropCount: 0,
      gameDate: game?.game_date ?? null,
    }),
    [game],
  );

  if (!job) {
    return (
      <AppShell>
        <EmptyState title="Loading analysis…" description="Fetching this run." />
      </AppShell>
    );
  }

  const playerName = fullName(job.players?.first_name, job.players?.last_name) || "Player";

  return (
    <AppShell>
      <Button variant="ghost" size="sm" className="w-fit" asChild>
        <Link to="/games/$gameId" params={{ gameId: job.game_id }}>
          <ArrowLeft className="mr-1 size-4" /> Back to game
        </Link>
      </Button>

      <PageHeader
        eyebrow="AI Review"
        title={`Candidate clips — ${playerName}`}
        description="Approve, reject or correct each candidate. Your corrections are stored as training data."
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag>{providerLabel({ provider: job.provider, isDemo: job.is_demo }).label}</Tag>
            {job.is_demo ? <Tag>DEMO AI RESULT</Tag> : <Tag>AI Generated</Tag>}
            <Tag>{job.model_version ?? job.provider}</Tag>
          </div>
        }
      />

      {needsConfirmation ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <p className="flex items-center gap-2 text-sm">
            <TriangleAlert className="size-4 text-warning" />
            We lost track of the player
            {typeof trackingLostAt === "number" ? ` at ${formatClock(trackingLostAt)}` : ""}. Confirm
            the player to continue.
          </p>
          {asset && job.player_id ? (
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
              Confirm player
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Reviewed" value={`${reviewed} of ${candidates.length}`} />
        <StatCard label="Approved" value={String(approved)} />
        <StatCard label="Rejected" value={String(rejected)} />
        <StatCard label="Wrong player" value={String(corrected)} />
      </div>

      <Progress value={candidates.length ? (reviewed / candidates.length) * 100 : 0} />

      <AnalysisDiagnostics
        summary={job.result_summary}
        provider={job.provider}
        isDemo={job.is_demo}
        modelVersion={job.model_version}
      />

      {candidates.length === 0 ? (
        <EmptyState
          title="No candidate clips yet"
          description="This run hasn't produced candidates. Check the analysis status on the game."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="space-y-3">
            <FilmPlayer
              key={current?.video_assets?.id ?? "none"}
              ref={playerRef}
              asset={current?.video_assets ?? null}
              startSeconds={current?.start_time ?? 0}
              onTimeUpdate={(seconds) => {
                if (current && seconds >= end) playerRef.current?.pause();
              }}
            />

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Previous candidate"
                  onClick={() => goto(index - 1)}
                  disabled={index === 0}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Next candidate"
                  onClick={() => goto(index + 1)}
                  disabled={index >= candidates.length - 1}
                >
                  <ChevronRight className="size-4" />
                </Button>
                <div>
                  <p className="text-sm font-semibold">
                    Clip {current?.sequence_number ?? index + 1}{" "}
                    <span className="text-muted-foreground">of {candidates.length}</span>
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {formatClock(start)} – {formatClock(end)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Tag>{candidateReasonLabel(current?.candidate_reason)}</Tag>
                <Tag>{CONFIDENCE_LABELS[confidenceTier(current?.ai_confidence)]}</Tag>
                <Tag>{REVIEW_STATUS_LABELS[current?.review_status ?? "pending"]}</Tag>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => submit("approve")}>
                <Check className="size-4" /> Approve <kbd className="ml-1 text-[10px]">A</kbd>
              </Button>
              <Button variant="outline" onClick={() => submit("reject")}>
                <X className="size-4" /> Reject <kbd className="ml-1 text-[10px]">R</kbd>
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  setInPoint(Number((playerRef.current?.getCurrentTime() ?? 0).toFixed(2)))
                }
              >
                Set In <kbd className="ml-1 text-[10px]">I</kbd>
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  setOutPoint(Number((playerRef.current?.getCurrentTime() ?? 0).toFixed(2)))
                }
              >
                Set Out <kbd className="ml-1 text-[10px]">O</kbd>
              </Button>
              <Button variant="outline" onClick={() => setWrongOpen(true)}>
                <UserX className="size-4" /> Wrong player
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="label-caps text-[11px] text-muted-foreground" htmlFor="tag">
                  Add tag
                </label>
                <div className="flex items-center gap-2">
                  <TagIcon className="size-4 text-muted-foreground" />
                  <Input
                    id="tag"
                    value={tagDraft}
                    onChange={(event) => setTagDraft(event.target.value)}
                    placeholder="e.g. left hand finish"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="label-caps text-[11px] text-muted-foreground" htmlFor="note">
                  Add note
                </label>
                <Textarea
                  id="note"
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder="Anything the model got wrong"
                  rows={2}
                />
              </div>
            </div>

            {current ? (
              <p className="text-xs text-muted-foreground">
                Original AI window {formatClock(current.original_start_time)} –{" "}
                {formatClock(current.original_end_time)} · confidence{" "}
                {current.ai_confidence?.toFixed(2) ?? "—"} — never overwritten.
              </p>
            ) : null}
          </div>

          <SectionCard title="Candidates" description={`${reviewed} of ${candidates.length} reviewed`}>
            <ol className="grid max-h-[520px] gap-1.5 overflow-y-auto">
              {candidates.map((candidate, candidateIndex) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    onClick={() => goto(candidateIndex)}
                    className={cn(
                      "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      candidateIndex === index
                        ? "border-primary/50 bg-primary/10"
                        : "border-border bg-surface-2 hover:border-primary/30",
                    )}
                  >
                    <span className="label-caps text-[10px] tabular-nums text-muted-foreground">
                      {formatClock(candidate.start_time)}
                    </span>
                    <span className="truncate">
                      {candidateReasonLabel(candidate.candidate_reason)}
                    </span>
                    <StatusDot candidate={candidate} />
                  </button>
                </li>
              ))}
            </ol>
          </SectionCard>
        </div>
      )}

      {current ? (
        <WrongPlayerDialog
          open={wrongOpen}
          onOpenChange={setWrongOpen}
          candidate={current}
          players={(game?.game_players ?? []).map((link) => ({
            id: link.player_id,
            name: fullName(link.players?.first_name, link.players?.last_name) || "Player",
          }))}
          onSubmit={(correctedPlayerId, notes) => {
            review.mutate(
              {
                candidate: current,
                decision: "wrong_player",
                correctedPlayerId,
                notes,
              },
              {
                onSuccess: async () => {
                  if (correctedPlayerId) {
                    // Store the correction as an identity signal for future runs.
                    await createConfirmation.mutateAsync({
                      game_id: current.game_id,
                      player_id: correctedPlayerId,
                      video_asset_id: current.video_asset_id,
                      timestamp_seconds: current.start_time,
                      bounding_box: { x: 0.45, y: 0.35, w: 0.09, h: 0.24 },
                      source: "user_correction",
                      candidate_clip_id: current.id,
                    });
                  }
                  setWrongOpen(false);
                  toast.success("Correction saved");
                  if (index < candidates.length - 1) goto(index + 1);
                },
                onError: (error) =>
                  toast.error(
                    error instanceof Error ? error.message : "Could not save the correction",
                  ),
              },
            );
          }}
        />
      ) : null}

      {asset && job.player_id && confirmOpen ? (
        <IdentifyPlayerDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          gameId={job.game_id}
          playerId={job.player_id}
          playerName={playerName}
          asset={asset}
          context={identityContext}
          starting={false}
          onStart={() => {
            setConfirmOpen(false);
            toast.success("Confirmations saved — re-run analysis to apply them");
          }}
        />
      ) : null}
    </AppShell>
  );
}

function StatusDot({ candidate }: { candidate: CandidateClipRecord }) {
  const tone =
    candidate.review_status === "approved" || candidate.review_status === "edited"
      ? "bg-success"
      : candidate.review_status === "rejected"
        ? "bg-destructive"
        : "bg-muted-foreground/50";
  return <span className={cn("size-2 rounded-full", tone)} aria-hidden />;
}

function WrongPlayerDialog({
  open,
  onOpenChange,
  candidate,
  players,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: CandidateClipRecord;
  players: { id: string; name: string }[];
  onSubmit: (correctedPlayerId: string | null, notes: string | null) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Wrong player</DialogTitle>
          <DialogDescription>
            Tell us who this actually is at {formatClock(candidate.start_time)}. The AI's original
            prediction is kept alongside your correction.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {players.map((player) => (
            <button
              key={player.id}
              type="button"
              onClick={() => setSelected(player.id === selected ? null : player.id)}
              className={cn(
                "w-full rounded-lg border px-3 py-2 text-left text-sm",
                selected === player.id
                  ? "border-primary bg-primary/10"
                  : "border-border bg-surface-2",
              )}
            >
              {player.name}
            </button>
          ))}
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Correction notes (optional)"
            rows={2}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit(selected, notes.trim() || null)}>Save correction</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
