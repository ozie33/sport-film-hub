import { createFileRoute, Link } from "@tanstack/react-router";
import { TrendingUp } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { DemoNotice } from "@/components/common/demo-badge";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard, StatCard } from "@/components/common/stat-card";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/lib/data/queries";
import { demoDevelopment } from "@/lib/demo/demo-data";

export const Route = createFileRoute("/_authenticated/development")({
  head: () => ({
    meta: [
      { title: "Development — CourtBase" },
      {
        name: "description",
        content: "Decision quality, shot profile and focus areas generated from analyzed film.",
      },
      { property: "og:title", content: "Development — CourtBase" },
      { property: "og:description", content: "Decision quality, shot profile and focus areas." },
    ],
  }),
  component: DevelopmentPage,
});

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="truncate text-muted-foreground">{label}</span>
        <span className="tabular-nums">{value}%</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function DevelopmentPage() {
  const { data: profile } = useProfile();
  const demoMode = profile?.demo_mode ?? false;

  if (!demoMode) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="Development"
          title="Player Development"
          description="Story-driven insight built from analyzed film, not raw box scores."
        />
        <EmptyState
          icon={<TrendingUp className="size-8" />}
          title="No development insight yet"
          description="Once a game has been analyzed, this page tells the story of the performance: decision quality, shot profile, strengths and focus areas."
          action={
            <Button asChild>
              <Link to="/games" search={{ add: true }}>
                Analyze a game
              </Link>
            </Button>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Development"
        title="Player Development"
        description="Story-driven insight built from analyzed film, not raw box scores."
      />
      <DemoNotice>Sample insight showing the structure of a development report.</DemoNotice>

      <SectionCard title="Game Story" description="What actually happened on the floor">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {demoDevelopment.gameStory.map((item) => (
            <StatCard key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Decision Quality">
          <div className="space-y-4">
            {demoDevelopment.decisionQuality.map((item) => (
              <Bar key={item.label} label={item.label} value={item.value} />
            ))}
          </div>
        </SectionCard>
        <SectionCard title="Shot Profile">
          <div className="space-y-4">
            {demoDevelopment.shotProfile.map((item) => (
              <Bar key={item.label} label={item.label} value={item.value} />
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Coaching Summary">
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="label-caps text-[11px] text-primary">Biggest strength</dt>
            <dd className="mt-1">{demoDevelopment.biggestStrength}</dd>
          </div>
          <div>
            <dt className="label-caps text-[11px] text-primary">Biggest opportunity</dt>
            <dd className="mt-1">{demoDevelopment.biggestOpportunity}</dd>
          </div>
          <div>
            <dt className="label-caps text-[11px] text-primary">Recommended focus</dt>
            <dd className="mt-1">{demoDevelopment.recommendedFocus}</dd>
          </div>
        </dl>
      </SectionCard>
    </AppShell>
  );
}
