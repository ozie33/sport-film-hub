import { Check, X } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { IDENTITY_TIER_LABELS, type IdentityScore } from "@/lib/identity/identity";

const TIER_CLASSES: Record<IdentityScore["tier"], string> = {
  incomplete: "border-destructive/40 bg-destructive/10 text-destructive",
  good: "border-primary/40 bg-primary/10 text-primary",
  excellent: "border-success/40 bg-success/10 text-success",
};

export function IdentityScoreCard({ score }: { score: IdentityScore }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label-caps text-xs text-muted-foreground">Identity Profile</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {score.met} of {score.total} identity signals ready
          </p>
        </div>
        <span
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-semibold uppercase",
            TIER_CLASSES[score.tier],
          )}
        >
          {IDENTITY_TIER_LABELS[score.tier]}
        </span>
      </div>
      <Progress value={score.percent} className="mt-3 h-2" />
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {score.checks.map((check) => (
          <li key={check.key} className="flex items-start gap-2 text-sm">
            <span
              className={cn(
                "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full",
                check.met ? "bg-success/20 text-success" : "bg-muted text-muted-foreground",
              )}
            >
              {check.met ? <Check className="size-3" /> : <X className="size-3" />}
            </span>
            <span>
              <span className={check.met ? "" : "text-muted-foreground"}>{check.label}</span>
              {check.met ? null : (
                <span className="block text-xs text-muted-foreground">{check.hint}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Informational only — it previews how ready this athlete is for automated identification.
      </p>
    </section>
  );
}