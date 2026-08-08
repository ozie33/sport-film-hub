/**
 * Authorized, short-lived access to film and reference media for the CV service.
 *
 * The CV service never receives Google or Supabase credentials — only signed
 * URLs that expire. Anything it caches locally is temporary by contract and
 * must be deleted after processing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { AnalysisReference } from "@/lib/analysis/provider.server";

type Client = SupabaseClient<Database>;

const FILM_BUCKET = "game-film";
const REFERENCE_BUCKET = "player-references";
/** Long enough for a full-game decode, short enough to be disposable. */
const ACCESS_TTL_SECONDS = 60 * 60 * 6;

function appBaseUrl(): string | null {
  return process.env["APP_BASE_URL"] ?? process.env["VITE_APP_BASE_URL"] ?? null;
}

/** Signed URL for raw film, whichever authorized source it lives in. */
export async function resolveFilmAccessUrl(
  supabase: Client,
  asset: {
    id: string;
    provider: string;
    storage_path: string | null;
    playback_url?: string | null;
  },
  viewerId: string,
): Promise<string | null> {
  if (asset.provider === "upload" && asset.storage_path) {
    const { data } = await supabase.storage
      .from(FILM_BUCKET)
      .createSignedUrl(asset.storage_path, ACCESS_TTL_SECONDS);
    return data?.signedUrl ?? null;
  }

  if (asset.provider === "google_drive") {
    const base = appBaseUrl();
    if (!base) return null;
    const { mintPlaybackToken } = await import("@/lib/drive/playback-token.server");
    const token = mintPlaybackToken(asset.id, viewerId);
    // Same streaming proxy the player uses, so Drive credentials stay server-side.
    return `${base.replace(/\/$/, "")}/api/public/drive-stream/${asset.id}?token=${encodeURIComponent(token)}`;
  }

  return null;
}

/**
 * Reference media the service may fetch. User-confirmed game crops are the
 * highest-trust signal; AI-generated crops are never trusted automatically.
 */
export async function resolveReferenceAccess(
  supabase: Client,
  playerId: string,
  gameId: string,
): Promise<AnalysisReference[]> {
  const { data: rows } = await supabase
    .from("player_reference_media")
    .select(
      "id, reference_type, provider, file_reference, ai_generated, source_game_id, created_at, metadata",
    )
    .eq("player_id", playerId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(40);

  const references: AnalysisReference[] = [];
  for (const row of rows ?? []) {
    if (!row.file_reference) continue;
    let url: string | null = null;
    if (row.provider === "upload" || row.provider === "storage") {
      const { data } = await supabase.storage
        .from(REFERENCE_BUCKET)
        .createSignedUrl(row.file_reference, ACCESS_TTL_SECONDS);
      url = data?.signedUrl ?? null;
    } else if (row.file_reference.startsWith("http")) {
      url = row.file_reference;
    }
    if (!url) continue;

    const isCrop = row.reference_type === "game_crop";
    const userConfirmed = isCrop && !row.ai_generated;
    references.push({
      kind:
        userConfirmed
          ? "confirmed_game_crop"
          : isCrop
            ? "game_crop"
            : row.reference_type === "reference_video"
              ? "reference_video"
              : "photo",
      url,
      trust: userConfirmed
        ? "high"
        : row.ai_generated
          ? "low"
          : row.reference_type === "reference_video"
            ? "medium"
            : "medium",
      sourceGameId: row.source_game_id,
      capturedAt: row.created_at,
    });
  }

  // Confirmed crops from this game first, then confirmed crops from any game.
  return references.sort((a, b) => {
    const score = (ref: AnalysisReference) =>
      (ref.trust === "high" ? 2 : ref.trust === "medium" ? 1 : 0) +
      (ref.sourceGameId === gameId ? 1 : 0);
    return score(b) - score(a);
  });
}
