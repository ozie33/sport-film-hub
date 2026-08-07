import { Link } from "@tanstack/react-router";

import { SectionCard } from "@/components/common/stat-card";
import { Tag } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { ANALYSIS_STATUS_LABELS } from "@/lib/analysis/analysis";
import { useAnalysisJobs, useCandidateCountsByJob } from "@/lib/data/analysis-queries";
import { formatGameDate, fullName } from "@/lib/format";

/** Every run is kept — re-analysis adds history instead of replacing it. */
export function AnalysisHistory({ gameId }: { gameId: string }) {
  const { data: jobs = [] } = useAnalysisJobs(gameId);
  const { data: counts = {} } = useCandidateCountsByJob(gameId);

  if (jobs.length === 0) {
    return (
      <SectionCard title="Analysis" description="Every analysis run for this game">
        <p className="text-sm text-muted-foreground">
          No analysis has run on this game yet. Runs are never overwritten — each one is kept with
          its own candidates and review decisions.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Analysis" description={`${jobs.length} run${jobs.length === 1 ? "" : "s"}`}>
      <ul className="space-y-2">
        {jobs.map((job) => {
          const tally = counts[job.id] ?? { total: 0, approved: 0, rejected: 0, corrected: 0 };
          return (
            <li key={job.id} className="rounded-lg border border-border bg-surface-2 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">
                  {fullName(job.players?.first_name, job.players?.last_name) || "Player"}
                </p>
                <Tag>{ANALYSIS_STATUS_LABELS[job.status]}</Tag>
                {job.is_demo ? <Tag>DEMO AI RESULT</Tag> : null}
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatGameDate(job.created_at)}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Tag>{job.video_assets?.label ?? "Film source"}</Tag>
                <Tag>{job.model_version ?? job.provider}</Tag>
                <Tag>{tally.total} candidates</Tag>
                <Tag>{tally.approved} approved</Tag>
                <Tag>{tally.rejected} rejected</Tag>
                <Tag>{tally.corrected} corrected</Tag>
              </div>
              {tally.total > 0 ? (
                <Button variant="outline" size="sm" className="mt-2" asChild>
                  <Link to="/analysis/$jobId" params={{ jobId: job.id }}>
                    Open AI Review
                  </Link>
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
