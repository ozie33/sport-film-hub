import { createFileRoute } from "@tanstack/react-router";
import { Scissors } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/stat-card";

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

const PLANNED = [
  {
    title: "Recruiting reel",
    description: "Your strongest clips ordered for college and program evaluators.",
  },
  {
    title: "Skill reel",
    description: "One skill at a time — finishing, passing reads, on-ball defense.",
  },
  {
    title: "Game reel",
    description: "A single game condensed into every meaningful possession.",
  },
  {
    title: "Development reel",
    description: "Before-and-after clips that show measurable progress over time.",
  },
];

function ReelsPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Reels"
        title="Reels"
        description="Shareable highlight and development reels assembled from your clip library."
      />

      <EmptyState
        icon={<Scissors className="size-8" />}
        title="Reel building arrives in a later phase"
        description="Once clips exist, you'll be able to assemble, order and export reels for recruiting and skill work."
      />

      <SectionCard title="Planned Reel Types" description="What this page will build">
        <ul className="grid gap-4 sm:grid-cols-2">
          {PLANNED.map((item) => (
            <li key={item.title} className="rounded-xl border border-border bg-surface-2 p-4">
              <h3 className="text-base font-semibold uppercase">{item.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
            </li>
          ))}
        </ul>
      </SectionCard>
    </AppShell>
  );
}
