import { cn } from "@/lib/utils";
import {
  WORKFLOW_STATUS_LABELS,
  WORKFLOW_STATUS_TONES,
  type StatusTone,
  type WorkflowStatus,
} from "@/lib/domain";

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  info: "border-info/40 bg-info/15 text-info",
  warning: "border-warning/40 bg-warning/15 text-warning",
  success: "border-success/40 bg-success/15 text-success",
  danger: "border-destructive/40 bg-destructive/15 text-destructive",
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  const key = status as WorkflowStatus;
  const tone = WORKFLOW_STATUS_TONES[key] ?? "neutral";
  return (
    <span
      className={cn(
        "label-caps inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px]",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label ?? WORKFLOW_STATUS_LABELS[key] ?? status}
    </span>
  );
}

export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground">
      {children}
    </span>
  );
}
