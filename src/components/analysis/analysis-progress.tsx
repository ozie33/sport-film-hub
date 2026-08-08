import { Link } from "@tanstack/react-router";
import { CheckCircle2, CircleDashed, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tag } from "@/components/common/status-badge";
import {
  ANALYSIS_STAGES,
  ANALYSIS_STATUS_LABELS,
  analysisErrorMessage,
  isActiveStatus,
  providerLabel,
} from "@/lib/analysis/analysis";
import { useAnalysisJob, useCancelAnalysis } from "@/lib/data/analysis-queries";
import { cn } from "@/lib/utils";

function useElapsed(startedAt: string | null | undefined, running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  if (!startedAt) return null;
  const seconds = Math.max(0, Math.round((now - new Date(startedAt).getTime()) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Live job progress. Nothing runs in the browser — this only reads the job, so
 * the user can leave the page and come back.
 */
export function AnalysisProgress({ jobId }: { jobId: string }) {
  const { data: job } = useAnalysisJob(jobId);
  const cancel = useCancelAnalysis();
  const running = job ? isActiveStatus(job.status) : false;
  const elapsed = useElapsed(job?.started_at, running);

  if (!job) return null;

  const stageIndex = ANALYSIS_STAGES.findIndex((stage) => stage.status === job.status);

  if (job.status === "failed" || job.status === "cancelled") {
    return (
      <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <TriangleAlert className="size-4 text-destructive" />
          {ANALYSIS_STATUS_LABELS[job.status]}
        </p>
        <p className="text-sm text-muted-foreground">
          {job.status === "cancelled"
            ? "This run was cancelled. Previous analysis runs are untouched."
            : analysisErrorMessage(job.error_code, job.error_message)}
        </p>
      </div>
    );
  }

  if (job.status === "ready_for_review" || job.status === "completed") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success/40 bg-success/10 p-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="size-4 text-success" /> Analysis ready for review
          </p>
          <p className="text-sm text-muted-foreground">
            {Number(job.result_summary["candidate_count"] ?? 0)} candidate clips ·{" "}
            {Number(job.result_summary["track_count"] ?? 0)} tracks
            {job.is_demo ? " · DEMO AI RESULT" : ""}
          </p>
        </div>
        <Button asChild>
          <Link to="/analysis/$jobId" params={{ jobId: job.id }}>
            Open AI Review
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Loader2 className="size-4 animate-spin text-primary" />
        <p className="text-sm font-semibold">{job.current_stage ?? ANALYSIS_STATUS_LABELS[job.status]}</p>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {job.progress_percent}%{elapsed ? ` · ${elapsed} elapsed` : ""}
        </span>
      </div>
      <Progress value={job.progress_percent} />
      <ol className="grid gap-1">
        {ANALYSIS_STAGES.map((stage, index) => (
          <li
            key={stage.status}
            className={cn(
              "flex items-center gap-2 text-xs",
              index < stageIndex
                ? "text-success"
                : index === stageIndex
                  ? "text-foreground"
                  : "text-muted-foreground",
            )}
          >
            {index < stageIndex ? (
              <CheckCircle2 className="size-3.5" />
            ) : index === stageIndex ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CircleDashed className="size-3.5" />
            )}
            {stage.label}
          </li>
        ))}
      </ol>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Tag>{providerLabel({ provider: job.provider, isDemo: job.is_demo }).label}</Tag>
          {job.is_demo ? <Tag>DEMO AI RESULT</Tag> : null}
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">
            You can leave this page — analysis keeps running.
          </p>
          <Button variant="outline" size="sm" onClick={() => cancel.mutate(job.id)}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
