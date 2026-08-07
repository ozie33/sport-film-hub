import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type {
  ProviderAccessLevel,
  VideoIngestionStatus,
  VideoProviderKey,
} from "@/lib/video/capabilities";

export const FILM_BUCKET = "game-film";

/* ------------------------------ video assets ----------------------------- */

export type VideoAssetRecord = {
  id: string;
  game_id: string;
  label: string;
  source_type: string;
  provider: VideoProviderKey;
  access_level: ProviderAccessLevel;
  external_video_id: string | null;
  external_url: string | null;
  embed_url: string | null;
  playback_url: string | null;
  storage_path: string | null;
  original_filename: string | null;
  mime_type: string | null;
  file_size: number | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  thumbnail_url: string | null;
  ingestion_status: VideoIngestionStatus;
  processing_status: VideoIngestionStatus;
  is_primary: boolean;
  error: string | null;
  provider_metadata: Record<string, unknown>;
  rights_confirmed_at: string | null;
  created_at: string;
};

const VIDEO_ASSET_COLUMNS =
  "id, game_id, label, source_type, provider, access_level, external_video_id, external_url, embed_url, playback_url, storage_path, original_filename, mime_type, file_size, duration, width, height, thumbnail_url, ingestion_status, processing_status, is_primary, error, provider_metadata, rights_confirmed_at, created_at";

/**
 * The game row carries the headline film status shown on cards and detail
 * headers, so it has to follow whatever the attached assets say.
 */
async function syncGameVideoStatus(gameId: string) {
  const { data, error } = await supabase
    .from("video_assets")
    .select("ingestion_status")
    .eq("game_id", gameId);
  if (error) return;
  const statuses = (data ?? []).map((row) => row.ingestion_status as VideoIngestionStatus);
  let next: "upload_pending" | "uploaded" | "processing" | "ready_for_review" | "error";
  if (statuses.length === 0) next = "upload_pending";
  else if (statuses.some((status) => status === "ready")) next = "ready_for_review";
  else if (statuses.some((status) => status === "processing")) next = "processing";
  else if (statuses.some((status) => status === "uploaded")) next = "uploaded";
  else if (statuses.every((status) => status === "failed")) next = "error";
  else next = "upload_pending";
  await supabase.from("games").update({ video_status: next }).eq("id", gameId);
}

export function useVideoAssets(gameId: string | undefined) {
  return useQuery({
    queryKey: ["video-assets", gameId],
    enabled: Boolean(gameId),
    queryFn: async (): Promise<VideoAssetRecord[]> => {
      const { data, error } = await supabase
        .from("video_assets")
        .select(VIDEO_ASSET_COLUMNS)
        .eq("game_id", gameId!)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as VideoAssetRecord[];
    },
  });
}

export function useAllVideoAssets() {
  return useQuery({
    queryKey: ["video-assets", "all"],
    queryFn: async (): Promise<VideoAssetRecord[]> => {
      const { data, error } = await supabase
        .from("video_assets")
        .select(VIDEO_ASSET_COLUMNS)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as VideoAssetRecord[];
    },
  });
}

export type VideoAssetInput = {
  game_id: string;
  label: string;
  source_type: "file" | "external_link";
  provider: VideoProviderKey;
  access_level: ProviderAccessLevel;
  external_video_id?: string | null;
  external_url?: string | null;
  embed_url?: string | null;
  storage_path?: string | null;
  original_filename?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  thumbnail_url?: string | null;
  ingestion_status: VideoIngestionStatus;
  processing_status: VideoIngestionStatus;
  is_primary?: boolean;
  provider_metadata?: Record<string, unknown>;
  rights_confirmed: boolean;
};

export function useCreateVideoAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: VideoAssetInput): Promise<VideoAssetRecord> => {
      const { rights_confirmed, ...rest } = input;
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("video_assets")
        .insert({
          ...rest,
          provider_metadata: (rest.provider_metadata ?? {}) as never,
          rights_confirmed_at: rights_confirmed ? new Date().toISOString() : null,
          rights_confirmed_by: rights_confirmed ? (auth.user?.id ?? null) : null,
        })
        .select(VIDEO_ASSET_COLUMNS)
        .single();
      if (error) throw error;
      return data as unknown as VideoAssetRecord;
    },
    onSuccess: (asset) => {
      queryClient.invalidateQueries({ queryKey: ["video-assets"] });
      queryClient.invalidateQueries({ queryKey: ["games"] });
      queryClient.invalidateQueries({ queryKey: ["game", asset.game_id] });
    },
  });
}

export function useUpdateVideoAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<
        Pick<
          VideoAssetRecord,
          | "label"
          | "ingestion_status"
          | "processing_status"
          | "duration"
          | "width"
          | "height"
          | "error"
          | "is_primary"
          | "access_level"
          | "thumbnail_url"
        >
      >;
    }) => {
      const { error } = await supabase.from("video_assets").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["video-assets"] }),
  });
}

export function useDeleteVideoAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (asset: Pick<VideoAssetRecord, "id" | "storage_path">) => {
      if (asset.storage_path) {
        await supabase.storage.from(FILM_BUCKET).remove([asset.storage_path]);
      }
      const { error } = await supabase.from("video_assets").delete().eq("id", asset.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["video-assets"] });
      queryClient.invalidateQueries({ queryKey: ["clips"] });
    },
  });
}

/** Short-lived signed URL for a privately stored upload. */
export function useSignedFilmUrl(storagePath: string | null | undefined) {
  return useQuery({
    queryKey: ["film-signed-url", storagePath],
    enabled: Boolean(storagePath),
    staleTime: 45 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.storage
        .from(FILM_BUCKET)
        .createSignedUrl(storagePath!, 60 * 60);
      if (error) throw error;
      return data?.signedUrl ?? null;
    },
  });
}

/* --------------------------- provider connections ------------------------ */

export type ProviderConnectionRecord = {
  id: string;
  provider: VideoProviderKey;
  status: "not_connected" | "connected" | "needs_configuration";
  external_account_id: string | null;
  config: Record<string, unknown>;
  connected_at: string | null;
};

export function useProviderConnections() {
  return useQuery({
    queryKey: ["video-provider-connections"],
    queryFn: async (): Promise<ProviderConnectionRecord[]> => {
      const { data, error } = await supabase
        .from("video_provider_connections")
        .select("id, provider, status, external_account_id, config, connected_at");
      if (error) throw error;
      return (data ?? []) as unknown as ProviderConnectionRecord[];
    },
  });
}

/* --------------------------------- clips -------------------------------- */

export type ClipRecord = {
  id: string;
  game_id: string;
  player_id: string | null;
  video_asset_id: string | null;
  event_id: string | null;
  title: string | null;
  category: string | null;
  start_time: number;
  end_time: number | null;
  approved: boolean;
  source: string;
  metadata: Record<string, unknown>;
  created_at: string;
  games: { id: string; title: string; sport_id: string; opponent: string | null } | null;
  players: { first_name: string; last_name: string } | null;
  video_assets: Pick<
    VideoAssetRecord,
    | "id"
    | "provider"
    | "access_level"
    | "external_video_id"
    | "external_url"
    | "embed_url"
    | "storage_path"
    | "label"
    | "thumbnail_url"
    | "duration"
  > | null;
  events: {
    id: string;
    event_type_key: string | null;
    event_subtype: string | null;
    outcome: string | null;
    offense_or_defense: string;
    tags: string[];
    notes: string | null;
  } | null;
};

const CLIP_COLUMNS =
  "id, game_id, player_id, video_asset_id, event_id, title, category, start_time, end_time, approved, source, metadata, created_at, games(id, title, sport_id, opponent), players(first_name, last_name), video_assets(id, provider, access_level, external_video_id, external_url, embed_url, storage_path, label, thumbnail_url, duration), events(id, event_type_key, event_subtype, outcome, offense_or_defense, tags, notes)";

export function useClips(gameId?: string) {
  return useQuery({
    queryKey: ["clips", gameId ?? "all"],
    queryFn: async (): Promise<ClipRecord[]> => {
      let query = supabase.from("clips").select(CLIP_COLUMNS);
      if (gameId) query = query.eq("game_id", gameId);
      const { data, error } = await query.order("start_time", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ClipRecord[];
    },
  });
}

export type MarkPlayInput = {
  game_id: string;
  sport_id: string;
  video_asset_id: string;
  player_id: string | null;
  event_type_key: string;
  event_type_name: string;
  event_subtype: string | null;
  outcome: string | null;
  offense_or_defense: string;
  start_time: number;
  end_time: number;
  tags: string[];
  notes: string | null;
};

/**
 * A marked play creates a manual event plus a clip that is only a timestamp
 * range against the original video asset — no clip file is rendered.
 */
export function useMarkPlay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: MarkPlayInput) => {
      const { data: event, error: eventError } = await supabase
        .from("events")
        .insert({
          game_id: input.game_id,
          sport_id: input.sport_id,
          video_asset_id: input.video_asset_id,
          player_id: input.player_id,
          event_type_key: input.event_type_key,
          event_subtype: input.event_subtype,
          outcome: input.outcome,
          offense_or_defense: input.offense_or_defense as never,
          start_time: input.start_time,
          end_time: input.end_time,
          tags: input.tags,
          notes: input.notes,
          source: "manual",
        })
        .select("id")
        .single();
      if (eventError) throw eventError;

      const { error: clipError } = await supabase.from("clips").insert({
        game_id: input.game_id,
        video_asset_id: input.video_asset_id,
        event_id: event.id,
        player_id: input.player_id,
        title: input.event_type_name,
        category: input.event_subtype ?? input.event_type_name,
        start_time: input.start_time,
        end_time: input.end_time,
        // A timestamp-range clip is immediately usable; nothing was transcoded.
        status: "reviewed",
        source: "manual",
      });
      if (clipError) throw clipError;
      return event.id as string;
    },
    onSuccess: (_id, variables) => {
      queryClient.invalidateQueries({ queryKey: ["clips"] });
      queryClient.invalidateQueries({ queryKey: ["game-events", variables.game_id] });
      queryClient.invalidateQueries({ queryKey: ["games"] });
    },
  });
}

export function useUpdateClip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<ClipRecord, "start_time" | "end_time" | "title" | "approved">>;
    }) => {
      const { error } = await supabase
        .from("clips")
        .update({ ...patch, manually_edited: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clips"] }),
  });
}

export function useDeleteClip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (clip: Pick<ClipRecord, "id" | "event_id">) => {
      const { error } = await supabase.from("clips").delete().eq("id", clip.id);
      if (error) throw error;
      if (clip.event_id) {
        await supabase.from("events").delete().eq("id", clip.event_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clips"] });
      queryClient.invalidateQueries({ queryKey: ["game-events"] });
    },
  });
}

/* ------------------------------- playlists ------------------------------ */

export type PlaylistRecord = {
  id: string;
  name: string;
  description: string | null;
  system_key: string | null;
  is_system: boolean;
  game_id: string | null;
  player_id: string | null;
  filter_definition: Record<string, unknown>;
  created_at: string;
};

export function usePlaylists() {
  return useQuery({
    queryKey: ["playlists"],
    queryFn: async (): Promise<PlaylistRecord[]> => {
      const { data, error } = await supabase
        .from("playlists")
        .select(
          "id, name, description, system_key, is_system, game_id, player_id, filter_definition, created_at",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PlaylistRecord[];
    },
  });
}

export function useCreatePlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      description: string | null;
      filter_definition: Record<string, unknown>;
      clip_ids: string[];
    }) => {
      const { data, error } = await supabase
        .from("playlists")
        .insert({
          name: input.name,
          description: input.description,
          filter_definition: input.filter_definition as never,
        })
        .select("id")
        .single();
      if (error) throw error;
      const playlistId = data.id as string;
      if (input.clip_ids.length > 0) {
        const { error: linkError } = await supabase.from("playlist_clips").insert(
          input.clip_ids.map((clipId, index) => ({
            playlist_id: playlistId,
            clip_id: clipId,
            position: index,
          })),
        );
        if (linkError) throw linkError;
      }
      return playlistId;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["playlists"] }),
  });
}

export function useDeletePlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("playlists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["playlists"] }),
  });
}

export function usePlaylistClipIds(playlistId: string | null) {
  return useQuery({
    queryKey: ["playlist-clips", playlistId],
    enabled: Boolean(playlistId),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("playlist_clips")
        .select("clip_id, position")
        .eq("playlist_id", playlistId!)
        .order("position");
      if (error) throw error;
      return (data ?? []).map((row) => row.clip_id as string);
    },
  });
}