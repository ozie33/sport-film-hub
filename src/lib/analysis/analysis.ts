/**
 * Phase 3 analysis vocabulary. Client-safe: no provider credentials, no server
 * imports. Everything the UI needs to talk about identification and tracking
 * without knowing which computer-vision service will eventually run.
 */

import { capabilitiesFor } from "@/lib/video/capabilities";

export type AnalysisJobStatus =
  | "not_started"
  | "queued"
  | "preparing_video"
  | "identifying_player"
  | "tracking_player"
  | "generating_candidates"
  | "ready_for_review"
  | "needs_confirmation"
  | "failed"
  | "cancelled"
  | "completed";

export const ANALYSIS_STATUS_LABELS: Record<AnalysisJobStatus, string> = {
  not_started: "Not started",
  queued: "Queued",
  preparing_video: "Preparing film",
  identifying_player: "Identifying player",
  tracking_player: "Tracking player",
  generating_candidates: "Creating candidate clips",
  ready_for_review: "Ready for review",
  needs_confirmation: "Needs player confirmation",
  failed: "Failed",
  cancelled: "Cancelled",
  completed: "Completed",
};

export const ANALYSIS_STATUS_TONES: Record<AnalysisJobStatus, string> = {
  not_started: "neutral",
  queued: "info",
  preparing_video: "info",
  identifying_player: "info",
  tracking_player: "info",
  generating_candidates: "info",
  ready_for_review: "success",
  needs_confirmation: "warning",
  failed: "danger",
  cancelled: "neutral",
  completed: "success",
};

/** The visible pipeline, in order. Used by the progress experience. */
export const ANALYSIS_STAGES: { status: AnalysisJobStatus; label: string }[] = [
  { status: "preparing_video", label: "Preparing film" },
  { status: "identifying_player", label: "Identifying player" },
  { status: "tracking_player", label: "Tracking player" },
  { status: "generating_candidates", label: "Finding player involvement" },
  { status: "ready_for_review", label: "Creating candidate clips" },
];

export const ACTIVE_STATUSES: AnalysisJobStatus[] = [
  "queued",
  "preparing_video",
  "identifying_player",
  "tracking_player",
  "generating_candidates",
];

export function isActiveStatus(status: AnalysisJobStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/* ----------------------------- review vocabulary ---------------------------- */

export type CandidateReviewStatus = "pending" | "approved" | "rejected" | "edited";

export const REVIEW_STATUS_LABELS: Record<CandidateReviewStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  edited: "Edited",
};

export type ConfidenceTier = "high" | "medium" | "low";

export const CONFIDENCE_LABELS: Record<ConfidenceTier, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

export function confidenceTier(value: number | null | undefined): ConfidenceTier {
  if (typeof value !== "number") return "low";
  if (value >= 0.8) return "high";
  if (value >= 0.55) return "medium";
  return "low";
}

/** Below this the tracker must ask a human instead of guessing. */
export const CONFIRMATION_THRESHOLD = 0.55;

/** Candidate reasons Phase 3 is allowed to emit — involvement, not events. */
export const CANDIDATE_REASONS = [
  "player_has_ball",
  "player_receives_ball",
  "player_passes",
  "player_shot_attempt",
  "player_drives",
  "player_defends_ball",
  "player_rebound_contest",
  "player_transition_involvement",
  "player_near_play",
] as const;

export type CandidateReason = (typeof CANDIDATE_REASONS)[number];

export const CANDIDATE_REASON_LABELS: Record<CandidateReason, string> = {
  player_has_ball: "Player has the ball",
  player_receives_ball: "Player receives the ball",
  player_passes: "Player passes",
  player_shot_attempt: "Player shot attempt",
  player_drives: "Player drives",
  player_defends_ball: "Player defends the ball",
  player_rebound_contest: "Player contests a rebound",
  player_transition_involvement: "Player involved in transition",
  player_near_play: "Player strongly involved near the play",
};

export function candidateReasonLabel(reason: string | null | undefined): string {
  if (!reason) return "Player involvement";
  return CANDIDATE_REASON_LABELS[reason as CandidateReason] ?? "Player involvement";
}

/* -------------------------------- clip padding ------------------------------ */

/** Pre/post roll around detected involvement. Configurable per job later. */
export const DEFAULT_PRE_ROLL = 3;
export const DEFAULT_POST_ROLL = 4;

/* ------------------------------ source eligibility -------------------------- */

export type AnalysisEligibility = {
  eligible: boolean;
  /** Film can be watched even when analysis is impossible. */
  filmReady: boolean;
  reason: string | null;
  code:
    | "ok"
    | "no_source"
    | "source_unsupported"
    | "source_not_ready"
    | "no_player"
    | "identity_incomplete";
};

export function evaluateAnalysisEligibility(input: {
  asset:
    | { provider: string; access_level: string; ingestion_status?: string | null }
    | null
    | undefined;
  hasPlayer: boolean;
  identityReady: boolean;
}): AnalysisEligibility {
  const { asset } = input;
  if (!asset) {
    return {
      eligible: false,
      filmReady: false,
      code: "no_source",
      reason: "Attach film to this game before running analysis.",
    };
  }

  const capabilities = capabilitiesFor(asset.provider, asset.access_level);
  const filmReady = capabilities.playback;

  if (!capabilities.raw_video_access || !capabilities.computer_vision_processing) {
    return {
      eligible: false,
      filmReady,
      code: "source_unsupported",
      reason:
        "This video can be viewed in Film Room, but this source does not currently provide raw-video access for automatic analysis.",
    };
  }

  if (asset.ingestion_status && asset.ingestion_status !== "ready") {
    return {
      eligible: false,
      filmReady,
      code: "source_not_ready",
      reason: "This film is still being prepared. Analysis can run once the source is ready.",
    };
  }

  if (!input.hasPlayer) {
    return {
      eligible: false,
      filmReady,
      code: "no_player",
      reason: "Attach the athlete to this game so we know who to identify and track.",
    };
  }

  if (!input.identityReady) {
    return {
      eligible: false,
      filmReady,
      code: "identity_incomplete",
      reason:
        "We need a bit more identity context — team, jersey number and at least one reference photo.",
    };
  }

  return { eligible: true, filmReady, code: "ok", reason: null };
}

/* --------------------------------- errors ---------------------------------- */

export const ANALYSIS_ERROR_MESSAGES: Record<string, string> = {
  analysis_service_unavailable:
    "Analysis service unavailable. No demo results were produced — try again once the analysis service is reachable.",
  video_unavailable: "We couldn't open the film for this game. Check the source and try again.",
  drive_auth_expired:
    "Your Google Drive authorization expired. Reconnect Drive in Settings and re-run analysis.",
  source_unsupported:
    "This source doesn't provide raw-video access, so automatic analysis can't run on it.",
  timeout: "The analysis service didn't respond in time. You can re-run analysis.",
  analysis_failed: "Analysis failed partway through. Nothing from earlier runs was lost.",
  player_not_found: "We couldn't find your player in this film. Confirm the player and re-run.",
  low_identity_confidence:
    "Identity confidence was too low to continue. Confirm your player in a few frames.",
  tracking_lost: "We lost track of the player. Confirm the player to continue.",
};

export function analysisErrorMessage(
  code: string | null | undefined,
  message: string | null | undefined,
): string {
  if (code && ANALYSIS_ERROR_MESSAGES[code]) return ANALYSIS_ERROR_MESSAGES[code]!;
  return message ?? "Something went wrong during analysis.";
}

/** Minimum confirmations before analysis may start; 5 is the target. */
export const MIN_IDENTITY_CONFIRMATIONS = 3;
export const TARGET_IDENTITY_CONFIRMATIONS = 5;

/** How a clip should be attributed in the UI: AI, corrected AI, or human. */
export function clipSourceLabel(
  source: string | null | undefined,
  approved?: boolean | null,
): string {
  if (source === "ai") return approved ? "AI Verified" : "AI Generated";
  if (source === "ai_corrected") return "AI + User Edited";
  return "Manual";
}

/* ------------------------------ provider labels ----------------------------- */

/** Honest provider attribution: real inference vs. development demo output. */
export function providerLabel(input: { provider?: string | null; isDemo?: boolean | null }): {
  label: "REAL CV" | "MOCK / DEMO";
  isDemo: boolean;
} {
  const isDemo = Boolean(input.isDemo) || input.provider === "mock";
  return { label: isDemo ? "MOCK / DEMO" : "REAL CV", isDemo };
}
