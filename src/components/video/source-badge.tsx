import { Film, HardDrive, Link2, Upload, Youtube } from "lucide-react";
import { Tag } from "@/components/common/status-badge";
import {
  ACCESS_LEVEL_LABELS,
  CAPABILITY_LABELS,
  INGESTION_STATUS_LABELS,
  INGESTION_STATUS_TONES,
  PROVIDER_LABELS,
  capabilitiesFor,
  type VideoCapabilities,
  type VideoIngestionStatus,
  type VideoProviderKey,
} from "@/lib/video/capabilities";
import { cn } from "@/lib/utils";

const PROVIDER_ICONS: Record<VideoProviderKey, typeof Film> = {
  upload: Upload,
  youtube: Youtube,
  hudl: Film,
  google_drive: HardDrive,
  external: Link2,
};

export function SourceBadge({ provider, className }: { provider: string; className?: string }) {
  const key = (provider as VideoProviderKey) ?? "external";
  const Icon = PROVIDER_ICONS[key] ?? Link2;
  return (
    <span
      className={cn(
        "label-caps inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] text-primary",
        className,
      )}
    >
      <Icon className="size-3" />
      {PROVIDER_LABELS[key] ?? provider}
    </span>
  );
}

const TONE_CLASSES: Record<string, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  info: "border-info/40 bg-info/15 text-info",
  warning: "border-warning/40 bg-warning/15 text-warning",
  success: "border-success/40 bg-success/15 text-success",
  danger: "border-destructive/40 bg-destructive/15 text-destructive",
};

export function IngestionBadge({ status }: { status: string }) {
  const key = status as VideoIngestionStatus;
  return (
    <span
      className={cn(
        "label-caps inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px]",
        TONE_CLASSES[INGESTION_STATUS_TONES[key] ?? "neutral"],
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {INGESTION_STATUS_LABELS[key] ?? status}
    </span>
  );
}

export function AccessLevelTag({ accessLevel }: { accessLevel: string }) {
  return (
    <Tag>
      {ACCESS_LEVEL_LABELS[accessLevel as keyof typeof ACCESS_LEVEL_LABELS] ?? accessLevel}
    </Tag>
  );
}

const SHOWN_CAPABILITIES: (keyof VideoCapabilities)[] = [
  "playback",
  "timestamp_seeking",
  "playback_speed",
  "manual_clipping",
  "continuous_player_cut",
  "raw_video_access",
  "server_side_processing",
  "computer_vision_processing",
  "local_clip_rendering",
  "export",
];

/** Honest, per-source capability read-out. */
export function CapabilityList({
  provider,
  accessLevel,
}: {
  provider: string;
  accessLevel: string;
}) {
  const capabilities = capabilitiesFor(provider, accessLevel);
  return (
    <ul className="grid gap-1.5 sm:grid-cols-2">
      {SHOWN_CAPABILITIES.map((capability) => (
        <li key={capability} className="flex items-center gap-2 text-xs">
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              capabilities[capability] ? "bg-success" : "bg-muted-foreground/50",
            )}
          />
          <span className={capabilities[capability] ? "" : "text-muted-foreground"}>
            {CAPABILITY_LABELS[capability]}
          </span>
        </li>
      ))}
    </ul>
  );
}