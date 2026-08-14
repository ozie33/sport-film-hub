import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3 } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard, StatCard } from "@/components/common/stat-card";
import { Tag } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getProductAnalyticsFn } from "@/lib/analytics/analytics.functions";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  head: () => ({
    meta: [
      { title: "Product analytics — CourtBase internal" },
      {
        name: "description",
        content:
          "Internal funnel metrics for the Smart Review and AI post-processing workflow: marked plays, playlists, reels and shares.",
      },
      { property: "og:title", content: "Product analytics — CourtBase internal" },
      {
        property: "og:description",
        content: "Internal funnel metrics for Smart Review and the AI post-processing workflow.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminAnalytics,
});

const RANGES = [7, 30, 90] as const;

function AdminAnalytics() {
  const [rangeDays, setRangeDays] = useState<number>(30);
  const fetchAnalytics = useServerFn(getProductAnalyticsFn);

  const { data, isLoading, error } = useQuery({
    queryKey: ["product-analytics", rangeDays],
    queryFn: () => fetchAnalytics({ data: { rangeDays } }),
    retry: false,
  });

  return (
    <AppShell>
      <PageHeader
        eyebrow="Internal"
        title="Product analytics"
        description="Adoption of Smart Review and the AI post-processing layer. Admin-only."
        actions={
          <div className="flex gap-1.5">
            {RANGES.map((value) => (
              <Button
                key={value}
                size="sm"
                variant={rangeDays === value ? "default" : "outline"}
                onClick={() => setRangeDays(value)}
              >
                {value}d
              </Button>
            ))}
          </div>
        }
      />

      {error ? (
        <EmptyState
          icon={<BarChart3 className="size-8" />}
          title="Not available"
          description={
            error instanceof Error && error.message.includes("Admins")
              ? "This view is limited to admin accounts."
              : "We could not load the metrics. Please refresh and try again."
          }
        />
      ) : isLoading || !data ? (
        <>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Active users" value={String(data.activeUsers)} hint={`Last ${data.rangeDays} days`} />
            <StatCard label="Events recorded" value={String(data.totalEvents)} />
            <StatCard
              label="Avg plays / review"
              value={data.metrics.averagePlaysPerReview?.toFixed(1) ?? "—"}
              hint="One review = one game in one session"
            />
            <StatCard
              label="Avg review length"
              value={
                data.metrics.averageReviewSessionMinutes !== null
                  ? `${data.metrics.averageReviewSessionMinutes.toFixed(1)}m`
                  : "—"
              }
              hint={`${data.metrics.reviewSessions} review sessions`}
            />
            <StatCard
              label="Link → first mark (median)"
              value={
                data.metrics.medianMinutesLinkToFirstMark !== null
                  ? `${data.metrics.medianMinutesLinkToFirstMark.toFixed(1)}m`
                  : "—"
              }
              hint={
                data.metrics.averageMinutesLinkToFirstMark !== null
                  ? `Average ${data.metrics.averageMinutesLinkToFirstMark.toFixed(1)}m`
                  : "No completed pairs yet"
              }
            />
            <StatCard
              label="Used Organize My Review"
              value={formatPct(data.metrics.pctUsersOrganizeReview)}
              hint="Share of reviewers"
            />
            <StatCard
              label="Built a reel"
              value={formatPct(data.metrics.pctUsersBuildReel)}
              hint="Share of reviewers"
            />
            <StatCard
              label="Shared a reel"
              value={formatPct(data.metrics.pctUsersShareReel)}
              hint="Share of reviewers"
            />
          </div>

          <SectionCard
            title="Funnel"
            description="Unique users per step, from the first YouTube link to a shared reel"
            actions={
              <Tag>
                {formatPct(data.metrics.pctUsersReturnToSameSubject)} return to the same game or
                athlete
              </Tag>
            }
          >
            <ul className="space-y-2">
              {data.funnel.map((step, index) => (
                <li key={step.key} className="rounded-lg border border-border bg-surface-2 px-3 py-2">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                    <p className="truncate text-sm font-medium">
                      <span className="mr-2 text-xs tabular-nums text-muted-foreground">
                        {index + 1}
                      </span>
                      {step.label}
                    </p>
                    <p className="shrink-0 text-sm tabular-nums">
                      <span className="font-semibold">{step.users}</span>
                      <span className="text-muted-foreground"> users · {step.events} events</span>
                    </p>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(100, step.conversionFromStart)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {step.conversionFromStart}% of step 1 · {step.conversionFromPrevious}% of
                    previous step
                  </p>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Latest events" description="Most recent instrumented actions">
            {data.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events recorded in this window yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.recent.map((row, index) => (
                  <li
                    key={`${row.occurred_at}-${index}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm"
                  >
                    <span className="truncate">{row.event_name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {new Date(row.occurred_at).toLocaleString()} · {row.session_id}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      )}
    </AppShell>
  );
}

function formatPct(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}
