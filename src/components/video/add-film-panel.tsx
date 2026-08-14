import { useRef, useState } from "react";
import {
  ArrowLeft,
  Film,
  HardDrive,
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
import { cn } from "@/lib/utils";
import {
  ACCEPTED_UPLOAD_EXTENSIONS,
  INGESTION_STATUS_LABELS,
  getAdapter,
  type VideoIngestionStatus,
  type VideoProviderKey,
} from "@/lib/video/capabilities";
import { getHudlAccess, getYouTubeMetadata } from "@/lib/video/providers.functions";
import { PRODUCT_EVENTS } from "@/lib/analytics/events";
import { trackEvent } from "@/lib/analytics/track";
import { DriveFilePicker, type DriveFile } from "@/components/video/drive-file-picker";
import { uploadFileToDrive } from "@/lib/drive/drive-upload";
import { createDriveUploadSession, getDriveFileDetails } from "@/lib/drive/drive.functions";
import { useConnectDrive, useDriveConnection } from "@/lib/drive/use-drive-connection";
import {
  buildFilmStoragePath,
  formatFileSize,
  isAcceptedVideoFile,
  videoMimeType,
  probeVideoFile,
  uploadFilmFile,
  type UploadController,
} from "@/lib/video/upload";

type SourceChoice = Extract<VideoProviderKey, "upload" | "google_drive" | "youtube" | "hudl">;

const SOURCE_ORDER: SourceChoice[] = ["upload", "google_drive", "youtube", "hudl"];

const SOURCE_ICONS: Record<SourceChoice, typeof Film> = {
  upload: UploadIcon,
  google_drive: HardDrive,
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
      ) : choice === "google_drive" ? (
        <DriveSourceForm
          gameId={gameId}
          makePrimary={makePrimary}
          {...(onAdded ? { onAdded } : {})}
        />
      ) : (
        <LinkForm
          key={choice}
          provider={choice as "youtube" | "hudl"}
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
  const driveAbortRef = useRef<(() => void) | null>(null);
  const drive = useDriveConnection();
  const connectDrive = useConnectDrive();

  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("Main angle");
  const [rights, setRights] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<VideoIngestionStatus | "idle">("idle");
  const [progress, setProgress] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [chosenDestination, setChosenDestination] = useState<"drive" | "app" | null>(null);

  const busy = status === "uploading" || status === "uploaded" || status === "processing";
  const driveConnected = Boolean(drive.data?.connected);
  // Drive is the recommended home for full games once it's connected.
  const destination = chosenDestination ?? (driveConnected ? "drive" : "app");

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
    if (destination === "drive" && !driveConnected) {
      toast.error("Connect Google Drive first, or store this film in the app.");
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

    if (destination === "drive") {
      try {
        const session = await createDriveUploadSession({
          data: {
            name: file.name,
            mimeType: videoMimeType(file),
            size: file.size,
          },
        });
        const driveUpload = uploadFileToDrive({
          file,
          sessionUrl: session.sessionUrl,
          onProgress: setProgress,
        });
        driveAbortRef.current = driveUpload.abort;
        const { fileId } = await driveUpload.promise;
        setStatus("uploaded");
        const details = await getDriveFileDetails({ data: { fileId } }).catch(() => null);
        await createAsset.mutateAsync({
          game_id: gameId,
          label: label.trim() || "Main angle",
          source_type: "provider_file",
          provider: "google_drive",
          access_level: "authorized_api",
          external_video_id: fileId,
          external_url: details?.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
          embed_url: `https://drive.google.com/file/d/${fileId}/preview`,
          thumbnail_url: details?.thumbnailLink ?? null,
          original_filename: file.name,
          mime_type: videoMimeType(file),
          file_size: file.size,
          duration: probe.duration,
          width: probe.width,
          height: probe.height,
          ingestion_status: "ready",
          processing_status: "ready",
          is_primary: makePrimary,
          permissions_status: "owner",
          is_temporary: false,
          rights_confirmed: true,
          provider_metadata: { uploaded_from_device: true },
        });
        toast.success("Film uploaded to your Google Drive and attached.");
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
        driveAbortRef.current = null;
      }
      return;
    }

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
        mime_type: videoMimeType(file),
        file_size: file.size,
        duration: probe.duration,
        width: probe.width,
        height: probe.height,
        ingestion_status: "ready",
        processing_status: "ready",
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
          {ACCEPTED_UPLOAD_EXTENSIONS.join(", ")} · you choose where the file lives
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
                  onClick={() => {
                    controllerRef.current?.abort();
                    driveAbortRef.current?.();
                  }}
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

          <div className="space-y-2">
            <Label>Where should this video be stored?</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <DestinationOption
                icon={HardDrive}
                title="My Google Drive"
                body={
                  driveConnected
                    ? `Recommended · stays in ${drive.data?.email ?? "your Drive"}`
                    : "Recommended · connect your Drive account to use this"
                }
                selected={destination === "drive"}
                disabled={busy}
                onSelect={() => setChosenDestination("drive")}
              />
              <DestinationOption
                icon={UploadIcon}
                title="Application storage"
                body="Private storage here. Best for short clips, not full games."
                selected={destination === "app"}
                disabled={busy}
                onSelect={() => setChosenDestination("app")}
              />
            </div>
            {destination === "drive" && !driveConnected ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={connectDrive.isPending}
                onClick={() =>
                  connectDrive.mutate(undefined, {
                    onError: (error) =>
                      toast.error(
                        error instanceof Error ? error.message : "Could not connect Google Drive",
                      ),
                  })
                }
              >
                {connectDrive.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Connect Google Drive
              </Button>
            ) : null}
          </div>

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
            {status === "failed"
              ? "Retry upload"
              : destination === "drive"
                ? "Upload to my Google Drive"
                : "Upload film"}
          </Button>
        </div>
      ) : null}

      <CapabilitySummary
        provider={destination === "drive" ? "google_drive" : "upload"}
        accessLevel={destination === "drive" ? "authorized_api" : "raw_video_available"}
      />
    </div>
  );
}

function DestinationOption({
  icon: Icon,
  title,
  body,
  selected,
  disabled,
  onSelect,
}: {
  icon: typeof Film;
  title: string;
  body: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors disabled:opacity-60",
        selected ? "border-primary bg-primary/10" : "border-border bg-muted/30 hover:border-primary/50",
      )}
    >
      <Icon className={cn("mt-0.5 size-4", selected ? "text-primary" : "text-muted-foreground")} />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{body}</span>
      </span>
    </button>
  );
}

/* ------------------------------ google drive ----------------------------- */

function DriveSourceForm({
  gameId,
  makePrimary,
  onAdded,
}: {
  gameId: string;
  makePrimary: boolean;
  onAdded?: () => void;
}) {
  const drive = useDriveConnection();
  const connectDrive = useConnectDrive();
  const createAsset = useCreateVideoAsset();
  const [selected, setSelected] = useState<DriveFile | null>(null);
  const [label, setLabel] = useState("");
  const [rights, setRights] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAttach() {
    if (!selected) return;
    if (!rights) {
      setError("Confirm you're authorized to use this film.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await createAsset.mutateAsync({
        game_id: gameId,
        label: label.trim() || selected.name,
        source_type: "provider_file",
        provider: "google_drive",
        access_level: "authorized_api",
        external_video_id: selected.id,
        external_url:
          selected.webViewLink ?? `https://drive.google.com/file/d/${selected.id}/view`,
        embed_url: `https://drive.google.com/file/d/${selected.id}/preview`,
        thumbnail_url: selected.thumbnailLink,
        original_filename: selected.name,
        mime_type: selected.mimeType,
        file_size: selected.size,
        duration: selected.durationMillis ? selected.durationMillis / 1000 : null,
        width: selected.width,
        height: selected.height,
        ingestion_status: "ready",
        processing_status: "ready",
        is_primary: makePrimary,
        permissions_status: selected.ownedByMe ? "owner" : "shared",
        is_temporary: false,
        rights_confirmed: true,
        provider_metadata: {
          modified_time: selected.modifiedTime,
          can_share: selected.canShare,
          owned_by_me: selected.ownedByMe,
        },
      });
      toast.success("Drive film attached — the file stays in your Drive.");
      setSelected(null);
      setRights(false);
      setLabel("");
      onAdded?.();
    } catch (attachError) {
      const message =
        attachError instanceof Error ? attachError.message : "Could not attach the film";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  if (drive.isPending) {
    return (
      <div className="grid place-items-center rounded-xl border border-border bg-card p-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!drive.data?.configured) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <HardDrive className="mx-auto mb-2 size-6 text-muted-foreground" />
        <p className="text-sm font-medium">Google Drive isn&apos;t set up for this app yet</p>
        <p className="text-xs text-muted-foreground">
          Once the Drive connector is configured, you&apos;ll be able to link film straight from your
          own Drive.
        </p>
      </div>
    );
  }

  if (!drive.data.connected) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <HardDrive className="mx-auto mb-2 size-6 text-muted-foreground" />
          <p className="text-sm font-medium">Connect your Google Drive</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Film stays in your Drive. We only store the reference, your timestamps, and your clips.
          </p>
          <Button
            type="button"
            disabled={connectDrive.isPending}
            onClick={() =>
              connectDrive.mutate(undefined, {
                onError: (connectError) =>
                  toast.error(
                    connectError instanceof Error
                      ? connectError.message
                      : "Could not connect Google Drive",
                  ),
              })
            }
          >
            {connectDrive.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Connect Google Drive
          </Button>
        </div>
        <CapabilitySummary provider="google_drive" accessLevel="authorized_api" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Select existing video from Drive</p>
          <span className="truncate text-xs text-muted-foreground">{drive.data.email}</span>
        </div>
        <DriveFilePicker
          selectedId={selected?.id ?? null}
          onSelect={(file) => {
            setSelected(file);
            setError(null);
            setLabel((current) => current || file.name.replace(/\.[^.]+$/, ""));
          }}
        />
        {selected ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="drive-label">Angle label</Label>
              <Input
                id="drive-label"
                value={label}
                onChange={(inputEvent) => setLabel(inputEvent.target.value)}
                placeholder={selected.name}
              />
            </div>
            <RightsCheck checked={rights} onChange={setRights} />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <Button type="button" onClick={handleAttach} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Attach Drive film
            </Button>
          </>
        ) : null}
      </div>
      <CapabilitySummary provider="google_drive" accessLevel="authorized_api" />
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
      const duration: number | null = null;
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
          metadata = { ...metadata, hudl_access: access.accessLevel, detail: access.detail };
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
        processing_status: "ready",
        is_primary: makePrimary,
        provider_metadata: metadata,
        rights_confirmed: true,
      });
      toast.success(`${adapter.label} film attached.`);
      trackEvent(
        provider === "youtube" ? PRODUCT_EVENTS.youtubeLinkAdded : PRODUCT_EVENTS.filmSourceAdded,
        { gameId, properties: { provider, access_level: resolvedAccess } },
      );
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