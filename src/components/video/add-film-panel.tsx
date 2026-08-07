import { useRef, useState } from "react";
import {
  ArrowLeft,
  Film,
  Loader2,
  ShieldCheck,
  Upload as UploadIcon,
  X,
  Youtube,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { CapabilityList } from "@/components/video/source-badge";
import { supabase } from "@/integrations/supabase/client";
import { useCreateVideoAsset } from "@/lib/data/video-queries";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ACCEPTED_UPLOAD_EXTENSIONS,
  INGESTION_STATUS_LABELS,
  getAdapter,
  type VideoIngestionStatus,
  type VideoProviderKey,
} from "@/lib/video/capabilities";
import { getHudlAccess, getYouTubeMetadata } from "@/lib/video/providers.functions";
import {
  buildFilmStoragePath,
  formatFileSize,
  isAcceptedVideoFile,
  probeVideoFile,
  uploadFilmFile,
  type UploadController,
} from "@/lib/video/upload";

type SourceChoice = Extract<VideoProviderKey, "upload" | "youtube" | "hudl">;

const SOURCE_ORDER: SourceChoice[] = ["upload", "youtube", "hudl"];

const SOURCE_ICONS: Record<SourceChoice, typeof Film> = {
  upload: UploadIcon,
  youtube: Youtube,
  hudl: Film,
};

/**
 * Provider-agnostic "Add Film" surface, reused by the Add Game wizard and the
 * game detail page. Every branch ends in one `video_assets` row.
 */
export function AddFilmPanel({
  gameId,
  makePrimary,
  onAdded,
}: {
  gameId: string;
  makePrimary: boolean;
  onAdded?: () => void;
}) {
  const [choice, setChoice] = useState<SourceChoice | null>(null);

  if (!choice) {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {SOURCE_ORDER.map((key) => {
          const adapter = getAdapter(key);
          const Icon = SOURCE_ICONS[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => setChoice(key)}
              className="group flex h-full flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/60 hover:bg-primary/5"
            >
              <span className="grid size-9 place-items-center rounded-lg border border-border bg-muted text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
                <Icon className="size-4" />
              </span>
              <span className="font-semibold">{adapter.label}</span>
              <span className="label-caps text-[10px] text-primary">{adapter.tagline}</span>
              <span className="text-xs text-muted-foreground">{adapter.description}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setChoice(null)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Choose a different source
      </button>

      {choice === "upload" ? (
        <UploadForm gameId={gameId} makePrimary={makePrimary} {...(onAdded ? { onAdded } : {})} />
      ) : (
        <LinkForm
          key={choice}
          provider={choice}
          gameId={gameId}
          makePrimary={makePrimary}
          {...(onAdded ? { onAdded } : {})}
        />
      )}
    </div>
  );
}

/* --------------------------------- upload -------------------------------- */

function UploadForm({
  gameId,
  makePrimary,
  onAdded,
}: {
  gameId: string;
  makePrimary: boolean;
  onAdded?: () => void;
}) {
  const createAsset = useCreateVideoAsset();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const controllerRef = useRef<UploadController | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("Main angle");
  const [rights, setRights] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<VideoIngestionStatus | "idle">("idle");
  const [progress, setProgress] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);

  const busy = status === "uploading" || status === "uploaded" || status === "processing";

  function acceptFile(candidate: File | undefined) {
    if (!candidate) return;
    if (!isAcceptedVideoFile(candidate)) {
      toast.error(`Unsupported file. Use ${ACCEPTED_UPLOAD_EXTENSIONS.join(", ")}.`);
      return;
    }
    setFile(candidate);
    setFailure(null);
    setProgress(0);
    setStatus("waiting");
  }

  async function handleUpload() {
    if (!file) return;
    if (!rights) {
      toast.error("Confirm you have the rights to analyze this film.");
      return;
    }
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      toast.error("Your session expired. Sign in again.");
      return;
    }

    setFailure(null);
    setStatus("uploading");
    setProgress(0);

    const probe = await probeVideoFile(file);
    const path = buildFilmStoragePath(auth.user.id, gameId, file.name);
    const controller = uploadFilmFile({ file, path, onProgress: setProgress });
    controllerRef.current = controller;

    try {
      await controller.promise;
      setStatus("uploaded");
      await createAsset.mutateAsync({
        game_id: gameId,
        label: label.trim() || "Main angle",
        source_type: "file",
        provider: "upload",
        access_level: "raw_video_available",
        storage_path: path,
        original_filename: file.name,
        mime_type: file.type || null,
        file_size: file.size,
        duration: probe.duration,
        width: probe.width,
        height: probe.height,
        ingestion_status: "ready",
        processing_status: "waiting",
        is_primary: makePrimary,
        rights_confirmed: true,
      });
      setStatus("ready");
      toast.success("Film uploaded and ready to review.");
      setFile(null);
      setRights(false);
      setProgress(0);
      setStatus("idle");
      onAdded?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      setStatus("failed");
      setFailure(message);
      if (message !== "Upload cancelled") toast.error(message);
    } finally {
      controllerRef.current = null;
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(dragEvent) => {
          dragEvent.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(dropEvent) => {
          dropEvent.preventDefault();
          setDragging(false);
          acceptFile(dropEvent.dataTransfer.files[0]);
        }}
        className={cn(
          "rounded-xl border border-dashed p-6 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border bg-card",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_UPLOAD_EXTENSIONS.join(",")}
          className="hidden"
          onChange={(changeEvent) => acceptFile(changeEvent.target.files?.[0])}
        />
        <UploadIcon className="mx-auto mb-2 size-6 text-muted-foreground" />
        <p className="text-sm font-medium">Drag and drop your game film</p>
        <p className="mb-3 text-xs text-muted-foreground">
          {ACCEPTED_UPLOAD_EXTENSIONS.join(", ")} · stored privately, only you can access it
        </p>
        <Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
          Choose file
        </Button>
      </div>

      {file ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="label-caps text-[10px] text-muted-foreground">
                {status === "idle" ? "Waiting" : INGESTION_STATUS_LABELS[status]}
              </span>
              {busy ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Cancel upload"
                  onClick={() => controllerRef.current?.abort()}
                >
                  <X className="size-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove file"
                  onClick={() => {
                    setFile(null);
                    setStatus("idle");
                    setFailure(null);
                  }}
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>
          </div>

          {status === "uploading" || status === "uploaded" ? (
            <div className="space-y-1">
              <Progress value={progress} />
              <p className="text-xs tabular-nums text-muted-foreground">{progress}%</p>
            </div>
          ) : null}

          {failure ? <p className="text-xs text-destructive">{failure}</p> : null}

          <div className="space-y-1.5">
            <Label htmlFor="film-label">Angle label</Label>
            <Input
              id="film-label"
              value={label}
              onChange={(inputEvent) => setLabel(inputEvent.target.value)}
              placeholder="Main angle"
            />
          </div>

          <RightsCheck checked={rights} onChange={setRights} />

          <Button type="button" onClick={handleUpload} disabled={busy || !rights}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <UploadIcon className="size-4" />}
            {status === "failed" ? "Retry upload" : "Upload film"}
          </Button>
        </div>
      ) : null}

      <CapabilitySummary provider="upload" accessLevel="raw_video_available" />
    </div>
  );
}

/* ------------------------------- link forms ------------------------------ */

function LinkForm({
  provider,
  gameId,
  makePrimary,
  onAdded,
}: {
  provider: Exclude<SourceChoice, "upload">;
  gameId: string;
  makePrimary: boolean;
  onAdded?: () => void;
}) {
  const adapter = getAdapter(provider);
  const createAsset = useCreateVideoAsset();
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState(provider === "youtube" ? "YouTube film" : "Hudl film");
  const [rights, setRights] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [accessLevel, setAccessLevel] = useState(
    provider === "youtube" ? "embed_available" : "link_only",
  );

  async function handleSave() {
    setError(null);
    const parsed = adapter.parseUrl?.(url);
    if (!parsed || !parsed.ok) {
      setError(parsed && !parsed.ok ? parsed.error : "Enter a link.");
      return;
    }
    if (!rights) {
      setError("Confirm you're authorized to use this film.");
      return;
    }

    setSaving(true);
    try {
      let resolvedLabel = label.trim();
      let duration: number | null = null;
      let thumbnail = parsed.value.thumbnailUrl;
      let metadata = parsed.value.providerMetadata;
      let resolvedAccess = parsed.value.accessLevel;

      if (provider === "youtube" && parsed.value.externalVideoId) {
        try {
          const meta = await getYouTubeMetadata({
            data: { videoId: parsed.value.externalVideoId },
          });
          if (meta.title) resolvedLabel = resolvedLabel || meta.title;
          if (meta.thumbnailUrl) thumbnail = meta.thumbnailUrl;
          metadata = { ...metadata, ...meta };
        } catch {
          // oEmbed is a nicety; a valid link is still attachable without it.
        }
      }

      if (provider === "hudl") {
        try {
          const access = await getHudlAccess();
          resolvedAccess = access.accessLevel;
          metadata = { ...metadata, connection_status: access.status, detail: access.detail };
        } catch {
          // Fall back to link-only, which is the safe default.
        }
      }

      setAccessLevel(resolvedAccess);

      await createAsset.mutateAsync({
        game_id: gameId,
        label: resolvedLabel || adapter.label,
        source_type: "external_link",
        provider,
        access_level: resolvedAccess,
        external_video_id: parsed.value.externalVideoId,
        external_url: parsed.value.externalUrl,
        embed_url: parsed.value.embedUrl,
        thumbnail_url: thumbnail,
        duration,
        ingestion_status: "ready",
        processing_status: "waiting",
        is_primary: makePrimary,
        provider_metadata: metadata,
        rights_confirmed: true,
      });
      toast.success(`${adapter.label} film attached.`);
      setUrl("");
      setRights(false);
      onAdded?.();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Could not attach the film";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${provider}-url`}>{adapter.label} link</Label>
          <Input
            id={`${provider}-url`}
            value={url}
            onChange={(inputEvent) => {
              setUrl(inputEvent.target.value);
              setError(null);
            }}
            placeholder={
              provider === "youtube"
                ? "https://www.youtube.com/watch?v=…"
                : "https://www.hudl.com/video/…"
            }
          />
          <p className="text-xs text-muted-foreground">{adapter.description}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${provider}-label`}>Angle label</Label>
          <Input
            id={`${provider}-label`}
            value={label}
            onChange={(inputEvent) => setLabel(inputEvent.target.value)}
          />
        </div>
        <RightsCheck checked={rights} onChange={setRights} />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <Button type="button" onClick={handleSave} disabled={saving || !url.trim()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          Attach film
        </Button>
      </div>
      <CapabilitySummary provider={provider} accessLevel={accessLevel} />
    </div>
  );
}

function RightsCheck({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        className="mt-0.5"
      />
      <span className="text-xs text-muted-foreground">
        I own this film or I&apos;m authorized to use it for analysis. I understand linked film stays
        with its provider and is never downloaded or re-hosted.
      </span>
    </label>
  );
}

/** Sets expectations before the source is attached. */
function CapabilitySummary({
  provider,
  accessLevel,
}: {
  provider: string;
  accessLevel: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <p className="label-caps mb-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <ShieldCheck className="size-3.5" />
        What this source supports
      </p>
      <CapabilityList provider={provider} accessLevel={accessLevel} />
    </div>
  );
}

export { formatDuration };