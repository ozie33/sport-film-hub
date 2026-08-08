/**
 * Server-side orchestration for analysis jobs: builds the identity context the
 * tracker needs, submits to the configured provider, advances status and
 * persists structured results. Never imported by client code.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  evaluateAnalysisEligibility,
  isActiveStatus,
  type AnalysisJobStatus,
} from "@/lib/analysis/analysis";
import {
  isServiceUnavailable,
  providerForKey,
  resolveAnalysisProvider,
  resolveAnalysisSettings,
  type AnalysisSubmitRequest,
} from "@/lib/analysis/provider.server";
import {
  resolveFilmAccessUrl,
  resolveReferenceAccess,
} from "@/lib/analysis/video-access.server";

type Client = SupabaseClient<Database>;

export type SubmitInput = {
  gameId: string;
  videoAssetId: string;
  playerId: string;
};

const JOB_COLUMNS =
  "id, game_id, video_asset_id, player_id, sport_id, analysis_type, status, progress_percent, current_stage, provider, is_demo, external_job_id, model_version, settings, identity_context, result_summary, requested_by, started_at, completed_at, error_code, error_message, created_at, updated_at";

async function buildRequest(
  supabase: Client,
  job: {
    id: string;
    game_id: string;
    video_asset_id: string | null;
    player_id: string | null;
    sport_id: string | null;
    analysis_type: string;
    identity_context: unknown;
    settings: unknown;
  },
  asset: {
    id?: string;
    provider: string;
    access_level: string;
    duration: number | null;
    storage_path?: string | null;
    mime_type?: string | null;
  },
  viewerId: string | null,
): Promise<AnalysisSubmitRequest> {
  const { data: confirmations } = await supabase
    .from("player_identity_confirmations")
    .select("timestamp_seconds, bounding_box, confidence")
    .eq("game_id", job.game_id)
    .eq("player_id", job.player_id!);

  const context = (job.identity_context ?? {}) as Record<string, unknown>;
  const settings = (job.settings ?? {}) as Record<string, unknown>;

  const [videoUrl, references, sportRow] = await Promise.all([
    asset.id
      ? resolveFilmAccessUrl(
          supabase,
          {
            id: asset.id,
            provider: asset.provider,
            storage_path: asset.storage_path ?? null,
          },
          viewerId ?? "service",
        )
      : Promise.resolve(null),
    resolveReferenceAccess(supabase, job.player_id!, job.game_id),
    job.sport_id
      ? supabase.from("sports").select("key").eq("id", job.sport_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    jobId: job.id,
    gameId: job.game_id,
    videoAssetId: job.video_asset_id!,
    playerId: job.player_id!,
    sportId: job.sport_id,
    sport: (sportRow as { data: { key: string } | null }).data?.key ?? null,
    analysisType: job.analysis_type,
    identityContext: {
      team: (context["team"] as string | null) ?? null,
      jerseyNumber: (context["jersey_number"] as string | null) ?? null,
      position: (context["position"] as string | null) ?? null,
      season: (context["season"] as string | null) ?? null,
      uniformPrimaryColor: (context["uniform_primary_color"] as string | null) ?? null,
      uniformSecondaryColor: (context["uniform_secondary_color"] as string | null) ?? null,
      referencePhotoCount: Number(context["reference_photo_count"] ?? 0),
      referenceVideoCount: Number(context["reference_video_count"] ?? 0),
      gameCropCount: Number(context["game_crop_count"] ?? 0),
      confirmations: (confirmations ?? []).map((row) => ({
        timestamp: Number(row.timestamp_seconds),
        boundingBox: (row.bounding_box ?? {}) as Record<string, unknown>,
        confidence: Number(row.confidence),
      })),
    },
    references,
    video: {
      provider: asset.provider,
      accessLevel: asset.access_level,
      durationSeconds: asset.duration,
      url: videoUrl,
      mimeType: asset.mime_type ?? null,
    },
    settings: resolveAnalysisSettings(settings),
  };
}

export async function submitAnalysis(supabase: Client, userId: string, input: SubmitInput) {
  const { data: asset, error: assetError } = await supabase
    .from("video_assets")
    .select("id, provider, access_level, duration, ingestion_status, game_id, storage_path, mime_type")
    .eq("id", input.videoAssetId)
    .single();
  if (assetError || !asset) throw new Error("video_unavailable");
  if (asset.game_id !== input.gameId) throw new Error("video_unavailable");

  const { data: game } = await supabase
    .from("games")
    .select(
      "id, sport_id, season, jersey_number, position_id, uniform_primary_color, uniform_secondary_color, team_id, teams(team_name, organization_name), sport_positions(name)",
    )
    .eq("id", input.gameId)
    .single();

  const { data: references } = await supabase
    .from("player_reference_media")
    .select("reference_type")
    .eq("player_id", input.playerId)
    .eq("active", true);

  const referenceTypes = (references ?? []).map((row) => row.reference_type as string);
  const photoCount = referenceTypes.filter(
    (type) => type !== "reference_video" && type !== "game_crop",
  ).length;
  const videoCount = referenceTypes.filter((type) => type === "reference_video").length;
  const cropCount = referenceTypes.filter((type) => type === "game_crop").length;

  const eligibility = evaluateAnalysisEligibility({
    asset: {
      provider: asset.provider as string,
      access_level: asset.access_level as string,
      ingestion_status: asset.ingestion_status as string,
    },
    hasPlayer: true,
    identityReady: true,
  });
  if (!eligibility.eligible) throw new Error(eligibility.code);

  // Throws analysis_service_unavailable when no real CV endpoint is configured
  // and mock is not explicitly enabled — no silent demo fallback.
  let provider;
  try {
    provider = resolveAnalysisProvider();
  } catch (resolveError) {
    if (isServiceUnavailable(resolveError)) throw new Error("analysis_service_unavailable");
    throw resolveError;
  }
  const team = game?.teams
    ? [game.teams.organization_name, game.teams.team_name].filter(Boolean).join(" · ")
    : null;

  const identityContext = {
    team,
    jersey_number: game?.jersey_number ?? null,
    position: game?.sport_positions?.name ?? null,
    season: game?.season ?? null,
    uniform_primary_color: game?.uniform_primary_color ?? null,
    uniform_secondary_color: game?.uniform_secondary_color ?? null,
    reference_photo_count: photoCount,
    reference_video_count: videoCount,
    game_crop_count: cropCount,
  };

  const { data: job, error } = await supabase
    .from("analysis_jobs")
    .insert({
      game_id: input.gameId,
      video_asset_id: input.videoAssetId,
      player_id: input.playerId,
      sport_id: game?.sport_id ?? null,
      analysis_type: "player_identification_tracking",
      status: "queued",
      provider: provider.key,
      is_demo: provider.isMock,
      requested_by: userId,
      settings: resolveAnalysisSettings() as never,
      identity_context: identityContext as never,
      started_at: new Date().toISOString(),
      current_stage: "Queued",
    })
    .select(JOB_COLUMNS)
    .single();
  if (error || !job) throw error ?? new Error("analysis_failed");

  try {
    const request = await buildRequest(
      supabase,
      job,
      {
        id: asset.id as string,
        provider: asset.provider as string,
        access_level: asset.access_level as string,
        duration: asset.duration as number | null,
        storage_path: asset.storage_path as string | null,
        mime_type: asset.mime_type as string | null,
      },
      userId,
    );
    if (!provider.isMock && !request.video.url) {
      throw new Error("video_unavailable");
    }
    const { externalJobId } = await provider.submitAnalysisJob(request);
    const { data: updated } = await supabase
      .from("analysis_jobs")
      .update({ external_job_id: externalJobId, status: "preparing_video", current_stage: "Preparing film" })
      .eq("id", job.id)
      .select(JOB_COLUMNS)
      .single();
    return updated ?? job;
  } catch (submitError) {
    const unavailable = isServiceUnavailable(submitError);
    await supabase
      .from("analysis_jobs")
      .update({
        status: "failed",
        error_code: unavailable ? "analysis_service_unavailable" : "analysis_failed",
        error_message: submitError instanceof Error ? submitError.message : "Submission failed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    throw unavailable ? new Error("analysis_service_unavailable") : submitError;
  }
}

/**
 * Polled by the client, but the work is entirely server-side: progress is
 * derived from the provider, so leaving the page changes nothing.
 */
export async function advanceAnalysis(supabase: Client, jobId: string) {
  const { data: job, error } = await supabase
    .from("analysis_jobs")
    .select(JOB_COLUMNS)
    .eq("id", jobId)
    .single();
  if (error || !job) throw new Error("analysis_failed");
  if (!isActiveStatus(job.status as AnalysisJobStatus)) return job;

  const { data: asset } = await supabase
    .from("video_assets")
    .select("id, provider, access_level, duration, storage_path, mime_type")
    .eq("id", job.video_asset_id!)
    .maybeSingle();

  let provider;
  try {
    provider = providerForKey(job.provider);
  } catch (resolveError) {
    if (!isServiceUnavailable(resolveError)) throw resolveError;
    const { data: failed } = await supabase
      .from("analysis_jobs")
      .update({
        status: "failed",
        error_code: "analysis_service_unavailable",
        error_message: "Analysis service unavailable",
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .select(JOB_COLUMNS)
      .single();
    return failed ?? job;
  }
  const request = await buildRequest(
    supabase,
    job,
    {
      id: (asset?.id as string) ?? job.video_asset_id!,
      provider: (asset?.provider as string) ?? "upload",
      access_level: (asset?.access_level as string) ?? "raw_video_available",
      duration: (asset?.duration as number | null) ?? null,
      storage_path: (asset?.storage_path as string | null) ?? null,
      mime_type: (asset?.mime_type as string | null) ?? null,
    },
    job.requested_by,
  );

  let status;
  try {
    status = await provider.getAnalysisStatus({
      externalJobId: job.external_job_id,
      startedAt: job.started_at,
      request,
    });
  } catch (statusError) {
    const { data: failed } = await supabase
      .from("analysis_jobs")
      .update({
        status: "failed",
        error_code: isServiceUnavailable(statusError)
          ? "analysis_service_unavailable"
          : "timeout",
        error_message: statusError instanceof Error ? statusError.message : "Status check failed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .select(JOB_COLUMNS)
      .single();
    return failed ?? job;
  }

  if (status.status !== "ready_for_review" && status.status !== "completed") {
    const { data: updated } = await supabase
      .from("analysis_jobs")
      .update({
        status: status.status,
        progress_percent: status.progressPercent,
        current_stage: status.currentStage,
      })
      .eq("id", job.id)
      .select(JOB_COLUMNS)
      .single();
    return updated ?? job;
  }

  // Results are in — persist once, idempotently.
  const { count } = await supabase
    .from("candidate_clips")
    .select("id", { count: "exact", head: true })
    .eq("analysis_job_id", job.id);
  if ((count ?? 0) > 0) return job;

  const results = await provider.getAnalysisResults({
    externalJobId: job.external_job_id,
    request,
  });

  const trackRows = results.tracks.map((track) => ({
    analysis_job_id: job.id,
    game_id: job.game_id,
    player_id: job.player_id,
    video_asset_id: job.video_asset_id,
    track_id: track.trackId,
    start_time: track.startTime,
    end_time: track.endTime,
    average_confidence: track.averageConfidence,
    identity_confidence: track.identityConfidence,
    tracking_confidence: track.trackingConfidence,
    needs_confirmation: track.needsConfirmation,
    is_demo: job.is_demo,
    metadata: track.metadata as never,
  }));

  const { data: insertedTracks, error: trackError } = await supabase
    .from("player_tracks")
    .insert(trackRows)
    .select("id, track_id");
  if (trackError) throw trackError;

  const trackMap = new Map((insertedTracks ?? []).map((row) => [row.track_id, row.id]));

  const candidateRows = results.candidates
    .slice()
    .sort((a, b) => a.startTime - b.startTime)
    .map((candidate, index) => ({
      analysis_job_id: job.id,
      game_id: job.game_id,
      video_asset_id: job.video_asset_id,
      player_id: job.player_id,
      track_id: trackMap.get(candidate.trackId) ?? null,
      sequence_number: index + 1,
      start_time: candidate.startTime,
      end_time: candidate.endTime,
      ai_confidence: candidate.confidence,
      candidate_reason: candidate.reason,
      ai_prediction: candidate.prediction as never,
      review_status: "pending" as const,
      // The AI's own numbers are frozen here and never overwritten.
      original_start_time: candidate.startTime,
      original_end_time: candidate.endTime,
      original_player_id: job.player_id,
      is_demo: job.is_demo,
    }));

  const { error: candidateError } = await supabase.from("candidate_clips").insert(candidateRows);
  if (candidateError) throw candidateError;

  const needsConfirmation = results.tracks.some((track) => track.needsConfirmation);
  const lostAt = results.tracks.find((track) => track.needsConfirmation)?.startTime ?? null;

  const { data: finished } = await supabase
    .from("analysis_jobs")
    .update({
      status: "ready_for_review",
      progress_percent: 100,
      current_stage: "Ready for review",
      model_version: results.modelVersion,
      completed_at: new Date().toISOString(),
      result_summary: {
        ...results.summary,
        candidate_count: candidateRows.length,
        track_count: trackRows.length,
        needs_confirmation: needsConfirmation,
        tracking_lost_at: lostAt,
      } as never,
    })
    .eq("id", job.id)
    .select(JOB_COLUMNS)
    .single();

  return finished ?? job;
}

export async function cancelAnalysis(supabase: Client, jobId: string) {
  const { data: job } = await supabase
    .from("analysis_jobs")
    .select("id, provider, external_job_id, status")
    .eq("id", jobId)
    .single();
  if (!job) throw new Error("analysis_failed");
  try {
    await providerForKey(job.provider).cancelAnalysisJob({ externalJobId: job.external_job_id });
  } catch {
    // Cancellation is best-effort; the local state still becomes cancelled.
  }
  const { data: updated } = await supabase
    .from("analysis_jobs")
    .update({ status: "cancelled", current_stage: "Cancelled", completed_at: new Date().toISOString() })
    .eq("id", jobId)
    .select(JOB_COLUMNS)
    .single();
  return updated;
}
