/**
 * Provider-agnostic video capability system.
 *
 * Nothing in the app should branch on "is this YouTube?" — it should ask the
 * capability matrix what the current source is allowed to do. This keeps the
 * door open for Veo, Balltime, Synergy, league systems and cloud storage
 * without touching Film Room code.
 *
 * IMPORTANT distinction:
 *   playback access      = we may show the film to the user
 *   raw-video access     = we may read the actual bytes/frames (Phase 3 CV)
 * These are NOT the same thing.
 */

export type VideoProviderKey = "upload" | "youtube" | "hudl" | "google_drive" | "external";

export type ProviderAccessLevel =
  | "link_only"
  | "embed_available"
  | "authorized_api"
  | "raw_video_available"
  | "unsupported";

export const ACCESS_LEVEL_LABELS: Record<ProviderAccessLevel, string> = {
  link_only: "Link only",
  embed_available: "Embedded playback",
  authorized_api: "Authorized API",
  raw_video_available: "Raw video available",
  unsupported: "Unsupported",
};

export type VideoIngestionStatus =
  | "waiting"
  | "uploading"
  | "uploaded"
  | "processing"
  | "ready"
  | "failed";

export const INGESTION_STATUS_LABELS: Record<VideoIngestionStatus, string> = {
  waiting: "Waiting",
  uploading: "Uploading",
  uploaded: "Uploaded",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

export const INGESTION_STATUS_TONES: Record<VideoIngestionStatus, string> = {
  waiting: "neutral",
  uploading: "info",
  uploaded: "info",
  processing: "warning",
  ready: "success",
  failed: "danger",
};

export type VideoCapabilities = {
  /** We are allowed to show the film to the user. */
  playback: boolean;
  /** We can jump the playhead to an arbitrary timestamp. */
  timestamp_seeking: boolean;
  /** We can change playback rate. */
  playback_speed: boolean;
  /** We can store timestamp-range clips against this asset. */
  manual_clipping: boolean;
  /** We can read the underlying video bytes. */
  raw_video_access: boolean;
  /** A backend job may fetch/inspect the media. */
  server_side_processing: boolean;
  /** Eligible for an external computer-vision pipeline (Phase 3). */
  computer_vision_processing: boolean;
  /** We can render a standalone clip file. */
  local_clip_rendering: boolean;
  /** We can export/download media. */
  export: boolean;
  /** Continuous back-to-back clip playback (Player Cut) is possible. */
  continuous_player_cut: boolean;
};

const NO_CAPABILITIES: VideoCapabilities = {
  playback: false,
  timestamp_seeking: false,
  playback_speed: false,
  manual_clipping: false,
  raw_video_access: false,
  server_side_processing: false,
  computer_vision_processing: false,
  local_clip_rendering: false,
  export: false,
  continuous_player_cut: false,
};

export const CAPABILITY_LABELS: Record<keyof VideoCapabilities, string> = {
  playback: "Playback",
  timestamp_seeking: "Timestamp seeking",
  playback_speed: "Playback speed",
  manual_clipping: "Manual clipping",
  raw_video_access: "Raw video access",
  server_side_processing: "Server-side processing",
  computer_vision_processing: "Computer vision (Phase 3)",
  local_clip_rendering: "Local clip rendering",
  export: "Export",
  continuous_player_cut: "Continuous Player Cut",
};

export type ParsedVideoSource = {
  provider: VideoProviderKey;
  accessLevel: ProviderAccessLevel;
  externalVideoId: string | null;
  externalUrl: string;
  embedUrl: string | null;
  thumbnailUrl: string | null;
  providerMetadata: Record<string, unknown>;
};

export type ParseResult =
  | { ok: true; value: ParsedVideoSource }
  | { ok: false; error: string };

export type VideoAdapter = {
  key: VideoProviderKey;
  label: string;
  tagline: string;
  description: string;
  /** Whether the Add Film flow currently offers this source. */
  enabled: boolean;
  /** Uploaded files have no URL to parse. */
  parseUrl?: (raw: string) => ParseResult;
  capabilities: (accessLevel: ProviderAccessLevel) => VideoCapabilities;
  /** Player surface the UI should mount for this provider. */
  playerKind: (accessLevel: ProviderAccessLevel) => "native" | "youtube" | "link" | "none";
};

/* ------------------------------- upload ------------------------------- */

export const ACCEPTED_UPLOAD_MIME = [
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/webm",
];
export const ACCEPTED_UPLOAD_EXTENSIONS = [".mp4", ".mov", ".m4v", ".webm"];

export const uploadAdapter: VideoAdapter = {
  key: "upload",
  label: "Upload video",
  tagline: "MP4, MOV, M4V or WEBM",
  description:
    "Upload film you own or are authorized to analyze. Stored privately — full frame access, so it can feed future analysis.",
  enabled: true,
  capabilities: (accessLevel) =>
    accessLevel === "raw_video_available"
      ? {
          playback: true,
          timestamp_seeking: true,
          playback_speed: true,
          manual_clipping: true,
          raw_video_access: true,
          server_side_processing: true,
          computer_vision_processing: true,
          local_clip_rendering: true,
          export: true,
          continuous_player_cut: true,
        }
      : { ...NO_CAPABILITIES, manual_clipping: true },
  playerKind: (accessLevel) => (accessLevel === "raw_video_available" ? "native" : "none"),
};

/* ------------------------------- youtube ------------------------------ */

const YOUTUBE_HOSTS = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
  "www.youtu.be",
];

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function extractYouTubeVideoId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (!YOUTUBE_HOSTS.includes(url.hostname.toLowerCase())) return null;

  const fromQuery = url.searchParams.get("v");
  if (fromQuery && YOUTUBE_ID_PATTERN.test(fromQuery)) return fromQuery;

  const segments = url.pathname.split("/").filter(Boolean);
  if (url.hostname.toLowerCase().endsWith("youtu.be")) {
    const candidate = segments[0];
    return candidate && YOUTUBE_ID_PATTERN.test(candidate) ? candidate : null;
  }
  const prefixes = ["embed", "shorts", "live", "v"];
  if (segments.length >= 2 && prefixes.includes(segments[0]!)) {
    const candidate = segments[1]!;
    return YOUTUBE_ID_PATTERN.test(candidate) ? candidate : null;
  }
  return null;
}

/** Start offset from `t`/`start` params, in seconds. */
export function extractYouTubeStart(raw: string): number | null {
  try {
    const url = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);
    const value = url.searchParams.get("t") ?? url.searchParams.get("start");
    if (!value) return null;
    const numeric = Number(value.replace(/s$/, ""));
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
  } catch {
    return null;
  }
}

export const youtubeAdapter: VideoAdapter = {
  key: "youtube",
  label: "YouTube",
  tagline: "Paste a YouTube link",
  description:
    "Film stays hosted on YouTube and plays through the official player. Tag timestamps freely — no frame access, so it can't feed video processing.",
  enabled: true,
  parseUrl: (raw) => {
    const videoId = extractYouTubeVideoId(raw);
    if (!videoId) {
      return {
        ok: false,
        error: "That doesn't look like a YouTube video link. Paste a youtube.com or youtu.be URL.",
      };
    }
    const start = extractYouTubeStart(raw);
    return {
      ok: true,
      value: {
        provider: "youtube",
        accessLevel: "embed_available",
        externalVideoId: videoId,
        externalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        embedUrl: `https://www.youtube.com/embed/${videoId}?enablejsapi=1`,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        providerMetadata: start !== null ? { start_seconds: start } : {},
      },
    };
  },
  capabilities: (accessLevel) =>
    accessLevel === "unsupported"
      ? NO_CAPABILITIES
      : {
          playback: true,
          timestamp_seeking: true,
          playback_speed: true,
          manual_clipping: true,
          // Playback access is not raw-video access.
          raw_video_access: false,
          server_side_processing: false,
          computer_vision_processing: false,
          local_clip_rendering: false,
          export: false,
          continuous_player_cut: true,
        },
  playerKind: (accessLevel) => (accessLevel === "unsupported" ? "none" : "youtube"),
};

/* -------------------------------- hudl -------------------------------- */

const HUDL_HOSTS = ["hudl.com", "www.hudl.com", "hudl.tv", "www.hudl.tv", "fan.hudl.com"];

export function isHudlUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);
    return HUDL_HOSTS.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export const hudlAdapter: VideoAdapter = {
  key: "hudl",
  label: "Hudl",
  tagline: "Paste a Hudl link",
  description:
    "Store an authorized Hudl film reference. Until a Hudl integration is connected we keep the link and open film in Hudl — we never bypass their access controls.",
  enabled: true,
  parseUrl: (raw) => {
    const trimmed = raw.trim();
    if (!isHudlUrl(trimmed)) {
      return { ok: false, error: "That doesn't look like a Hudl link (hudl.com or hudl.tv)." };
    }
    const normalized = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    return {
      ok: true,
      value: {
        provider: "hudl",
        accessLevel: "link_only",
        externalVideoId: null,
        externalUrl: normalized,
        embedUrl: null,
        thumbnailUrl: null,
        providerMetadata: { connection_status: "not_connected" },
      },
    };
  },
  capabilities: (accessLevel) => {
    switch (accessLevel) {
      case "raw_video_available":
        return {
          playback: true,
          timestamp_seeking: true,
          playback_speed: true,
          manual_clipping: true,
          raw_video_access: true,
          server_side_processing: true,
          computer_vision_processing: true,
          local_clip_rendering: true,
          export: true,
          continuous_player_cut: true,
        };
      case "authorized_api":
      case "embed_available":
        return {
          playback: true,
          timestamp_seeking: true,
          playback_speed: false,
          manual_clipping: true,
          raw_video_access: false,
          server_side_processing: false,
          computer_vision_processing: false,
          local_clip_rendering: false,
          export: false,
          continuous_player_cut: true,
        };
      case "link_only":
        // We can still tag timestamps against the film the coach watches in Hudl.
        return { ...NO_CAPABILITIES, manual_clipping: true };
      default:
        return NO_CAPABILITIES;
    }
  },
  playerKind: (accessLevel) => {
    if (accessLevel === "raw_video_available") return "native";
    if (accessLevel === "authorized_api" || accessLevel === "embed_available") return "link";
    if (accessLevel === "link_only") return "link";
    return "none";
  },
};

/* ------------------------------ external ------------------------------ */

/* ---------------------------- google drive ---------------------------- */

const DRIVE_HOSTS = ["drive.google.com", "docs.google.com"];

/** Drive links are only a convenience — the file id is the identifier we keep. */
export function extractDriveFileId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^[A-Za-z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  let url: URL;
  try {
    url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (!DRIVE_HOSTS.includes(url.hostname.toLowerCase())) return null;
  const fromQuery = url.searchParams.get("id");
  if (fromQuery) return fromQuery;
  const segments = url.pathname.split("/").filter(Boolean);
  const marker = segments.indexOf("d");
  if (marker >= 0 && segments[marker + 1]) return segments[marker + 1]!;
  return null;
}

export const googleDriveAdapter: VideoAdapter = {
  key: "google_drive",
  label: "Google Drive",
  tagline: "Your own Drive library",
  description:
    "Film stays in your Google Drive. We store the reference and stream it with your authorization — full frame access for future analysis, no duplicate copy here.",
  enabled: true,
  parseUrl: (raw) => {
    const fileId = extractDriveFileId(raw);
    if (!fileId) {
      return { ok: false, error: "That doesn't look like a Google Drive file link." };
    }
    return {
      ok: true,
      value: {
        provider: "google_drive",
        accessLevel: "authorized_api",
        externalVideoId: fileId,
        externalUrl: `https://drive.google.com/file/d/${fileId}/view`,
        embedUrl: `https://drive.google.com/file/d/${fileId}/preview`,
        thumbnailUrl: null,
        providerMetadata: {},
      },
    };
  },
  capabilities: (accessLevel) => {
    switch (accessLevel) {
      // Authorized Drive file: we can stream the real bytes on the server.
      case "authorized_api":
      case "raw_video_available":
        return {
          playback: true,
          timestamp_seeking: true,
          playback_speed: true,
          manual_clipping: true,
          raw_video_access: true,
          server_side_processing: true,
          computer_vision_processing: true,
          local_clip_rendering: false,
          export: true,
          continuous_player_cut: true,
        };
      // Access was revoked or never granted — degrade honestly to a link.
      case "link_only":
      case "embed_available":
        return { ...NO_CAPABILITIES, manual_clipping: true };
      default:
        return NO_CAPABILITIES;
    }
  },
  playerKind: (accessLevel) => {
    if (accessLevel === "authorized_api" || accessLevel === "raw_video_available") return "native";
    if (accessLevel === "link_only" || accessLevel === "embed_available") return "link";
    return "none";
  },
};

/* ------------------------------ external ------------------------------ */

export const externalAdapter: VideoAdapter = {
  key: "external",
  label: "Other source",
  tagline: "Veo, Balltime, team camera…",
  description:
    "Additional providers plug into the same video-source layer. Not available yet.",
  enabled: false,
  parseUrl: (raw) => {
    const trimmed = raw.trim();
    try {
      const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
      return {
        ok: true,
        value: {
          provider: "external",
          accessLevel: "link_only",
          externalVideoId: null,
          externalUrl: url.toString(),
          embedUrl: null,
          thumbnailUrl: null,
          providerMetadata: {},
        },
      };
    } catch {
      return { ok: false, error: "Enter a valid URL." };
    }
  },
  capabilities: () => ({ ...NO_CAPABILITIES, manual_clipping: true }),
  playerKind: () => "link",
};

export const VIDEO_ADAPTERS: Record<VideoProviderKey, VideoAdapter> = {
  upload: uploadAdapter,
  youtube: youtubeAdapter,
  hudl: hudlAdapter,
  google_drive: googleDriveAdapter,
  external: externalAdapter,
};

export const PROVIDER_LABELS: Record<VideoProviderKey, string> = {
  upload: "Uploaded",
  youtube: "YouTube",
  hudl: "Hudl",
  google_drive: "Google Drive",
  external: "External",
};

export function getAdapter(provider: string): VideoAdapter {
  return VIDEO_ADAPTERS[provider as VideoProviderKey] ?? externalAdapter;
}

export function capabilitiesFor(
  provider: string | null | undefined,
  accessLevel: string | null | undefined,
): VideoCapabilities {
  if (!provider) return NO_CAPABILITIES;
  return getAdapter(provider).capabilities(
    (accessLevel as ProviderAccessLevel) ?? "unsupported",
  );
}

export function playerKindFor(
  provider: string | null | undefined,
  accessLevel: string | null | undefined,
): "native" | "youtube" | "link" | "none" {
  if (!provider) return "none";
  return getAdapter(provider).playerKind((accessLevel as ProviderAccessLevel) ?? "unsupported");
}