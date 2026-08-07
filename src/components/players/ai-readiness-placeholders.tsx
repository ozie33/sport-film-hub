import { Sparkles } from "lucide-react";

import { SectionCard } from "@/components/common/stat-card";

const PLACEHOLDERS = [
  { title: "Player Identification", copy: "Automatic identification results will appear here." },
  { title: "AI Confidence", copy: "Per-event confidence scores will appear here." },
  { title: "Tracking Confidence", copy: "Frame-level tracking confidence will appear here." },
  { title: "Reference Matching", copy: "Matches against reference media will appear here." },
  { title: "Game Crops", copy: "Confirmed crops will be saved to the reference library." },
];

/** Empty-state scaffolding for the analysis phase — no AI runs yet. */
export function AiReadinessPlaceholders() {
  return (
    <SectionCard
      title="Analysis readiness"
      description="Reserved for automated analysis. Nothing is processed at this stage."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PLACEHOLDERS.map((item) => (
          <div
            key={item.title}
            className="rounded-xl border border-dashed border-border bg-surface/60 p-4"
          >
            <p className="flex items-center gap-2 text-sm font-semibold uppercase">
              <Sparkles className="size-4 text-primary" />
              {item.title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{item.copy}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}