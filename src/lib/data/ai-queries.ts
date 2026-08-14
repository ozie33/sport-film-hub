import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  buildReelFn,
  generateDevelopmentSummaryFn,
  generateGameStoryFn,
  generatePlaylistFn,
  organizeReviewFn,
} from "@/lib/ai/review-ai.functions";
import type { DevelopmentSummaryContent, GameStoryContent } from "@/lib/ai/review-ai";
import { CLIP_COLUMNS, type ClipRecord } from "@/lib/data/video-queries";

/* ------------------------------- playlists -------------------------------- */

export type AiPlaylist = {
  id: string;
  name: string;
  description: string | null;
  game_id: string | null;
  player_id: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
};

export function usePlaylists(scope?: { gameId?: string | null; aiOnly?: boolean }) {
  return useQuery({
    queryKey: ["playlists", scope?.gameId ?? "all", scope?.aiOnly ?? false],
    queryFn: async (): Promise<AiPlaylist[]> => {
      let query = supabase
        .from("playlists")
        .select("id, name, description, game_id, player_id, created_at, metadata")
        .order("created_at", { ascending: false });
      if (scope?.gameId) query = query.eq("game_id", scope.gameId);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as unknown as AiPlaylist[];
      return scope?.aiOnly ? rows.filter((row) => row.metadata?.["ai_generated"] === true) : rows;
    },
  });
}

export function usePlaylistClips(playlistId: string | undefined) {
  return useQuery({
    queryKey: ["playlist-clips", playlistId],
    enabled: Boolean(playlistId),
    queryFn: async (): Promise<ClipRecord[]> => {
      const { data, error } = await supabase
        .from("playlist_clips")
        .select(`position, clips(${CLIP_COLUMNS})`)
        .eq("playlist_id", playlistId!)
        .order("position", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown as { clips: ClipRecord | null }[])
        .map((row) => row.clips)
        .filter((clip): clip is ClipRecord => Boolean(clip));
    },
  });
}

export function useOrganizeReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { gameId?: string | null; playerId?: string | null }) =>
      organizeReviewFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
    },
  });
}

export function useGeneratePlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { prompt: string; gameId?: string | null; playerId?: string | null }) =>
      generatePlaylistFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
    },
  });
}

/* ---------------------------------- reels --------------------------------- */

export type ReelRecord = {
  id: string;
  title: string;
  reel_type: string;
  player_id: string | null;
  game_id: string | null;
  summary: string | null;
  reviewed_clip_count: number;
  version: number;
  parent_reel_id: string | null;
  source_game_ids: string[];
  generation_prompt: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  players: { first_name: string; last_name: string } | null;
};

const REEL_COLUMNS =
  "id, title, reel_type, player_id, game_id, summary, reviewed_clip_count, version, parent_reel_id, source_game_ids, generation_prompt, metadata, created_at, players(first_name, last_name)";

export function useReels() {
  return useQuery({
    queryKey: ["reels"],
    queryFn: async (): Promise<ReelRecord[]> => {
      const { data, error } = await supabase
        .from("reels")
        .select(REEL_COLUMNS)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ReelRecord[];
    },
  });
}

export type ReelClipRecord = { id: string; position: number; ai_reason: string | null; clip: ClipRecord };

export function useReelClips(reelId: string | undefined) {
  return useQuery({
    queryKey: ["reel-clips", reelId],
    enabled: Boolean(reelId),
    queryFn: async (): Promise<ReelClipRecord[]> => {
      const { data, error } = await supabase
        .from("reel_clips")
        .select(`id, position, ai_reason, clips(${CLIP_COLUMNS})`)
        .eq("reel_id", reelId!)
        .order("position", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown as
        { id: string; position: number; ai_reason: string | null; clips: ClipRecord | null }[])
        .filter((row) => Boolean(row.clips))
        .map((row) => ({
          id: row.id,
          position: row.position,
          ai_reason: row.ai_reason,
          clip: row.clips as ClipRecord,
        }));
    },
  });
}

export function useBuildReel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      mode: string;
      playerId?: string | null;
      gameIds?: string[] | null;
      customPrompt?: string | null;
      maxClips?: number | null;
      adjustments?: string[] | null;
      parentReelId?: string | null;
    }) => buildReelFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reels"] });
    },
  });
}

export function useUpdateReel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { title?: string; summary?: string } }) => {
      const { error } = await supabase.from("reels").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reels"] }),
  });
}

export function useDeleteReel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("reels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reels"] }),
  });
}

/** Manual overrides always win: the human can reorder, remove or add clips. */
export function useReorderReelClips() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ reelId, orderedIds }: { reelId: string; orderedIds: string[] }) => {
      for (const [index, id] of orderedIds.entries()) {
        const { error } = await supabase.from("reel_clips").update({ position: index }).eq("id", id);
        if (error) throw error;
      }
      return reelId;
    },
    onSuccess: (reelId) => queryClient.invalidateQueries({ queryKey: ["reel-clips", reelId] }),
  });
}

export function useRemoveReelClip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reelId }: { id: string; reelId: string }) => {
      const { error } = await supabase.from("reel_clips").delete().eq("id", id);
      if (error) throw error;
      return reelId;
    },
    onSuccess: (reelId) => queryClient.invalidateQueries({ queryKey: ["reel-clips", reelId] }),
  });
}

export function useAddReelClips() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      reelId,
      clipIds,
      startPosition,
    }: {
      reelId: string;
      clipIds: string[];
      startPosition: number;
    }) => {
      const { error } = await supabase.from("reel_clips").insert(
        clipIds.map((clipId, index) => ({
          reel_id: reelId,
          clip_id: clipId,
          position: startPosition + index,
          ai_reason: null,
        })),
      );
      if (error) throw error;
      return reelId;
    },
    onSuccess: (reelId) => queryClient.invalidateQueries({ queryKey: ["reel-clips", reelId] }),
  });
}

/* --------------------------------- reports -------------------------------- */

export type AiReportRecord<T> = {
  id: string;
  report_type: string;
  game_id: string | null;
  player_id: string | null;
  reviewed_clip_count: number;
  content: T;
  created_at: string;
  updated_at: string;
};

export function useGameStory(gameId: string | undefined) {
  return useQuery({
    queryKey: ["ai-report", "game_story", gameId],
    enabled: Boolean(gameId),
    queryFn: async (): Promise<AiReportRecord<GameStoryContent> | null> => {
      const { data, error } = await supabase
        .from("ai_reports")
        .select("id, report_type, game_id, player_id, reviewed_clip_count, content, created_at, updated_at")
        .eq("report_type", "game_story")
        .eq("game_id", gameId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as AiReportRecord<GameStoryContent> | null;
    },
  });
}

export function useDevelopmentSummary(playerId: string | undefined) {
  return useQuery({
    queryKey: ["ai-report", "development_summary", playerId],
    enabled: Boolean(playerId),
    queryFn: async (): Promise<AiReportRecord<DevelopmentSummaryContent> | null> => {
      const { data, error } = await supabase
        .from("ai_reports")
        .select("id, report_type, game_id, player_id, reviewed_clip_count, content, created_at, updated_at")
        .eq("report_type", "development_summary")
        .eq("player_id", playerId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as AiReportRecord<DevelopmentSummaryContent> | null;
    },
  });
}

export function useGenerateGameStory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { gameId: string }) => generateGameStoryFn({ data: input }),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ai-report", "game_story", variables.gameId] });
    },
  });
}

export function useGenerateDevelopmentSummary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { playerId: string }) => generateDevelopmentSummaryFn({ data: input }),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["ai-report", "development_summary", variables.playerId],
      });
    },
  });
}