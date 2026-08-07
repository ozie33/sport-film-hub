import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  isActiveStatus,
  type AnalysisJobStatus,
  type CandidateReviewStatus,
} from "@/lib/analysis/analysis";
import {
  buildReferenceStoragePath,
  REFERENCE_BUCKET,
} from "@/lib/data/identity-queries";
import type { FilmSource } from "@/components/video/film-player";

/* ------------------------------- analysis jobs ------------------------------ */

export type AnalysisJobRecord = {
  id: string;
  game_id: string;
  video_asset_id: string | null;
  player_id: string | null;
  sport_id: string | null;
  analysis_type: string;
  status: AnalysisJobStatus;
  progress_percent: number;
  current_stage: string | null;
  provider: string;
  is_demo: boolean;
  external_job_id: string | null;
  model_version: string | null;
  settings: Record<string, unknown>;
  identity_context: Record<string, unknown>;
  result_summary: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  players: { first_name: string; last_name: string } | null;
  video_assets: { id: string; label: string; provider: string } | null;
};

const JOB_COLUMNS =
  "id, game_id, video_asset_id, player_id, sport_id, analysis_type, status, progress_percent, current_stage, provider, is_demo, external_job_id, model_version, settings, identity_context, result_summary, started_at, completed_at, error_code, error_message, created_at, players(first_name, last_name), video_assets(id, label, provider)";

export function useAnalysisJobs(gameId: string | undefined) {
  return useQuery({
    queryKey: ["analysis-jobs", gameId],
    enabled: Boolean(gameId),
    queryFn: async (): Promise<AnalysisJobRecord[]> => {
      const { data, error } = await supabase
        .from("analysis_jobs")
        .select(JOB_COLUMNS)
        .eq("game_id", gameId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AnalysisJobRecord[];
    },
  });
}

/**
 * Polls the server while a job is running. The work happens server-side, so
 * leaving and returning to the page simply picks up wherever it got to.
 */
export function useAnalysisJob(jobId: string | null | undefined) {
  return useQuery({
    queryKey: ["analysis-job", jobId],
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = (query.state.data as AnalysisJobRecord | undefined)?.status;
      return status && isActiveStatus(status) ? 2500 : false;
    },
    queryFn: async (): Promise<AnalysisJobRecord | null> => {
      const { data, error } = await supabase
        .from("analysis_jobs")
        .select(JOB_COLUMNS)
        .eq("id", jobId!)
        .maybeSingle();
      if (error) throw error;
      const job = (data ?? null) as unknown as AnalysisJobRecord | null;
      if (job && isActiveStatus(job.status)) {
        // Ask the server to move the job forward, then report the fresh row.
        const { pollAnalysisJob } = await import("@/lib/analysis/analysis.functions");
        try {
          const advanced = (await pollAnalysisJob({
            data: { jobId: job.id },
          })) as unknown as AnalysisJobRecord;
          return { ...job, ...advanced };
        } catch {
          return job;
        }
      }
      return job;
    },
  });
}

export function useStartAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { gameId: string; videoAssetId: string; playerId: string }) => {
      const { startAnalysisJob } = await import("@/lib/analysis/analysis.functions");
      const job = (await startAnalysisJob({ data: input })) as unknown as { id: string };
      return job.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analysis-jobs"] });
    },
  });
}

export function useCancelAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      const { cancelAnalysisJob } = await import("@/lib/analysis/analysis.functions");
      await cancelAnalysisJob({ data: { jobId } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analysis-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["analysis-job"] });
    },
  });
}

/* --------------------------- identity confirmations ------------------------- */

export type BoundingBox = { x: number; y: number; w: number; h: number };

export type ConfirmationRecord = {
  id: string;
  game_id: string;
  player_id: string;
  video_asset_id: string | null;
  timestamp_seconds: number;
  bounding_box: BoundingBox | Record<string, unknown>;
  frame_image_path: string | null;
  source: string;
  confidence: number;
  saved_to_reference_id: string | null;
  created_at: string;
};

const CONFIRMATION_COLUMNS =
  "id, game_id, player_id, video_asset_id, timestamp_seconds, bounding_box, frame_image_path, source, confidence, saved_to_reference_id, created_at";

export function useIdentityConfirmations(
  gameId: string | undefined,
  playerId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["identity-confirmations", gameId, playerId],
    enabled: Boolean(gameId && playerId),
    queryFn: async (): Promise<ConfirmationRecord[]> => {
      const { data, error } = await supabase
        .from("player_identity_confirmations")
        .select(CONFIRMATION_COLUMNS)
        .eq("game_id", gameId!)
        .eq("player_id", playerId!)
        .order("timestamp_seconds", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ConfirmationRecord[];
    },
  });
}

export function useCreateConfirmation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      game_id: string;
      player_id: string;
      video_asset_id: string | null;
      timestamp_seconds: number;
      bounding_box: BoundingBox;
      /** Optional PNG data URL captured from the frame the user clicked. */
      frame_data_url?: string | null;
      source?: "user_confirmation" | "user_correction";
      candidate_clip_id?: string | null;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      let framePath: string | null = null;

      if (input.frame_data_url && auth.user) {
        const blob = await (await fetch(input.frame_data_url)).blob();
        const path = buildReferenceStoragePath(
          auth.user.id,
          input.player_id,
          `frame-${Math.round(input.timestamp_seconds)}.png`,
        );
        const { error: uploadError } = await supabase.storage
          .from(REFERENCE_BUCKET)
          .upload(path, blob, { contentType: "image/png" });
        if (!uploadError) framePath = path;
      }

      const { data, error } = await supabase
        .from("player_identity_confirmations")
        .insert({
          game_id: input.game_id,
          player_id: input.player_id,
          video_asset_id: input.video_asset_id,
          timestamp_seconds: input.timestamp_seconds,
          bounding_box: input.bounding_box as never,
          frame_image_path: framePath,
          source: input.source ?? "user_confirmation",
          confidence: 1.0,
          candidate_clip_id: input.candidate_clip_id ?? null,
          created_by: auth.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["identity-confirmations"] });
    },
  });
}

export function useDeleteConfirmation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (confirmation: ConfirmationRecord) => {
      if (confirmation.frame_image_path) {
        await supabase.storage.from(REFERENCE_BUCKET).remove([confirmation.frame_image_path]);
      }
      const { error } = await supabase
        .from("player_identity_confirmations")
        .delete()
        .eq("id", confirmation.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["identity-confirmations"] }),
  });
}

/** Promotes a confirmed frame into the player's Reference Library as a Game Crop. */
export function useSaveConfirmationAsGameCrop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      confirmation: ConfirmationRecord;
      context: {
        team: string | null;
        jersey_number: string | null;
        uniform_primary_color: string | null;
        game_date: string | null;
      };
    }) => {
      const { confirmation } = input;
      if (!confirmation.frame_image_path) throw new Error("This confirmation has no saved frame.");
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("player_reference_media")
        .insert({
          player_id: confirmation.player_id,
          reference_type: "game_crop",
          provider: "upload",
          file_reference: confirmation.frame_image_path,
          mime_type: "image/png",
          source_game_id: confirmation.game_id,
          ai_generated: false,
          confidence_score: confirmation.confidence,
          notes: "Confirmed from game film",
          uploaded_by: auth.user?.id ?? null,
          metadata: {
            ...input.context,
            timestamp_seconds: confirmation.timestamp_seconds,
            bounding_box: confirmation.bounding_box,
            origin: "player_identification",
          } as never,
        })
        .select("id")
        .single();
      if (error) throw error;
      await supabase
        .from("player_identity_confirmations")
        .update({ saved_to_reference_id: data.id })
        .eq("id", confirmation.id);
      return data.id as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["player-references"] });
      queryClient.invalidateQueries({ queryKey: ["identity-confirmations"] });
    },
  });
}

/* -------------------------------- tracks ----------------------------------- */

export type PlayerTrackRecord = {
  id: string;
  analysis_job_id: string;
  track_id: string;
  start_time: number;
  end_time: number;
  average_confidence: number | null;
  identity_confidence: number | null;
  tracking_confidence: number | null;
  needs_confirmation: boolean;
  is_demo: boolean;
  metadata: Record<string, unknown>;
};

export function usePlayerTracks(jobId: string | null | undefined) {
  return useQuery({
    queryKey: ["player-tracks", jobId],
    enabled: Boolean(jobId),
    queryFn: async (): Promise<PlayerTrackRecord[]> => {
      const { data, error } = await supabase
        .from("player_tracks")
        .select(
          "id, analysis_job_id, track_id, start_time, end_time, average_confidence, identity_confidence, tracking_confidence, needs_confirmation, is_demo, metadata",
        )
        .eq("analysis_job_id", jobId!)
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PlayerTrackRecord[];
    },
  });
}

/* ----------------------------- candidate clips ------------------------------ */

export type CandidateClipRecord = {
  id: string;
  analysis_job_id: string;
  game_id: string;
  video_asset_id: string | null;
  player_id: string | null;
  sequence_number: number;
  start_time: number;
  end_time: number;
  ai_confidence: number | null;
  candidate_reason: string | null;
  ai_prediction: Record<string, unknown>;
  review_status: CandidateReviewStatus;
  original_start_time: number;
  original_end_time: number;
  original_player_id: string | null;
  corrected_player_id: string | null;
  wrong_player: boolean;
  user_decision: string | null;
  correction_notes: string | null;
  tags: string[];
  reviewed_at: string | null;
  clip_id: string | null;
  is_demo: boolean;
  players: { first_name: string; last_name: string } | null;
  video_assets: FilmSource | null;
};

const CANDIDATE_COLUMNS =
  "id, analysis_job_id, game_id, video_asset_id, player_id, sequence_number, start_time, end_time, ai_confidence, candidate_reason, ai_prediction, review_status, original_start_time, original_end_time, original_player_id, corrected_player_id, wrong_player, user_decision, correction_notes, tags, reviewed_at, clip_id, is_demo, players(first_name, last_name), video_assets(id, provider, access_level, external_video_id, external_url, embed_url, storage_path, label, thumbnail_url, duration)";

export function useCandidateClips(jobId: string | null | undefined) {
  return useQuery({
    queryKey: ["candidate-clips", jobId],
    enabled: Boolean(jobId),
    queryFn: async (): Promise<CandidateClipRecord[]> => {
      const { data, error } = await supabase
        .from("candidate_clips")
        .select(CANDIDATE_COLUMNS)
        .eq("analysis_job_id", jobId!)
        .order("sequence_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CandidateClipRecord[];
    },
  });
}

/** Keeps the per-player "All player clips" system playlist in step with approvals. */
async function syncPlayerClipsPlaylist(playerId: string | null, gameId: string, clipId: string) {
  if (!playerId) return;
  const systemKey = `all_player_clips:${playerId}`;
  const { data: existing } = await supabase
    .from("playlists")
    .select("id")
    .eq("system_key", systemKey)
    .maybeSingle();

  let playlistId = existing?.id as string | undefined;
  if (!playlistId) {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data: created, error } = await supabase
      .from("playlists")
      .insert({
        owner_id: auth.user.id,
        player_id: playerId,
        name: "All player clips",
        description: "Approved clips for this athlete, newest game last.",
        system_key: systemKey,
        is_system: true,
        filter_definition: { source: "approved_ai_and_manual", game_id: gameId } as never,
      })
      .select("id")
      .single();
    if (error) return;
    playlistId = created.id as string;
  }

  const { count } = await supabase
    .from("playlist_clips")
    .select("id", { count: "exact", head: true })
    .eq("playlist_id", playlistId);

  await supabase
    .from("playlist_clips")
    .insert({ playlist_id: playlistId, clip_id: clipId, position: count ?? 0 });
}

export type ReviewDecision = {
  candidate: CandidateClipRecord;
  decision: "approve" | "reject" | "wrong_player";
  startTime?: number;
  endTime?: number;
  correctedPlayerId?: string | null;
  notes?: string | null;
  tags?: string[];
};

/**
 * Records a human decision on an AI candidate. The AI's original timestamps,
 * confidence and prediction are never overwritten — corrections sit alongside
 * them so this whole table can become training data later.
 */
export function useReviewCandidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReviewDecision) => {
      const { candidate, decision } = input;
      const { data: auth } = await supabase.auth.getUser();
      const startTime = input.startTime ?? candidate.start_time;
      const endTime = input.endTime ?? candidate.end_time;
      const edited =
        startTime !== candidate.original_start_time || endTime !== candidate.original_end_time;

      const reviewStatus: CandidateReviewStatus =
        decision === "approve" ? (edited ? "edited" : "approved") : "rejected";

      // A previously approved candidate that is now rejected loses its clip.
      if (decision !== "approve" && candidate.clip_id) {
        await supabase.from("clips").delete().eq("id", candidate.clip_id);
      }

      let clipId = decision === "approve" ? candidate.clip_id : null;

      if (decision === "approve") {
        const payload = {
          game_id: candidate.game_id,
          video_asset_id: candidate.video_asset_id,
          player_id: candidate.player_id,
          title: "AI candidate",
          category: candidate.candidate_reason,
          start_time: startTime,
          end_time: endTime,
          approved: true,
          status: "reviewed" as const,
          // Human edits are AI-corrected, untouched AI stays "ai".
          source: (edited ? "ai_corrected" : "ai") as "ai" | "ai_corrected",
          manually_edited: edited,
          model_version: null,
          created_by: auth.user?.id ?? null,
          metadata: {
            analysis_job_id: candidate.analysis_job_id,
            candidate_clip_id: candidate.id,
            ai_confidence: candidate.ai_confidence,
            candidate_reason: candidate.candidate_reason,
            ai_start_time: candidate.original_start_time,
            ai_end_time: candidate.original_end_time,
            review: reviewStatus,
            is_demo: candidate.is_demo,
          } as never,
        };
        if (clipId) {
          const { error } = await supabase.from("clips").update(payload).eq("id", clipId);
          if (error) throw error;
        } else {
          const { data: clip, error } = await supabase
            .from("clips")
            .insert(payload)
            .select("id")
            .single();
          if (error) throw error;
          clipId = clip.id as string;
          await syncPlayerClipsPlaylist(candidate.player_id, candidate.game_id, clipId);
        }
      }

      const { error: updateError } = await supabase
        .from("candidate_clips")
        .update({
          review_status: reviewStatus,
          start_time: startTime,
          end_time: endTime,
          user_decision: decision,
          wrong_player: decision === "wrong_player",
          corrected_player_id: input.correctedPlayerId ?? candidate.corrected_player_id,
          correction_notes: input.notes ?? candidate.correction_notes,
          tags: input.tags ?? candidate.tags,
          reviewed_by: auth.user?.id ?? null,
          reviewed_at: new Date().toISOString(),
          clip_id: clipId,
        })
        .eq("id", candidate.id);
      if (updateError) throw updateError;
      return reviewStatus;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidate-clips"] });
      queryClient.invalidateQueries({ queryKey: ["clips"] });
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({ queryKey: ["analysis-jobs"] });
    },
  });
}

export type CandidateCounts = {
  total: number;
  approved: number;
  rejected: number;
  corrected: number;
};

/** Per-job review tallies for the analysis history panel. */
export function useCandidateCountsByJob(gameId: string | undefined) {
  return useQuery({
    queryKey: ["candidate-counts", gameId],
    enabled: Boolean(gameId),
    queryFn: async (): Promise<Record<string, CandidateCounts>> => {
      const { data, error } = await supabase
        .from("candidate_clips")
        .select("analysis_job_id, review_status, wrong_player")
        .eq("game_id", gameId!);
      if (error) throw error;
      const counts: Record<string, CandidateCounts> = {};
      for (const row of data ?? []) {
        const key = row.analysis_job_id as string;
        counts[key] ??= { total: 0, approved: 0, rejected: 0, corrected: 0 };
        const entry = counts[key]!;
        entry.total += 1;
        if (row.review_status === "approved" || row.review_status === "edited") entry.approved += 1;
        if (row.review_status === "rejected") entry.rejected += 1;
        if (row.wrong_player) entry.corrected += 1;
      }
      return counts;
    },
  });
}
