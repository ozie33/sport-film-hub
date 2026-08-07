/**
 * Universal (sport-agnostic) domain vocabulary.
 * Sport-specific vocabulary (positions, event types, subtypes, outcomes) is
 * loaded from the database catalog tables instead of being declared here.
 */

export type WorkflowStatus =
  | "upload_pending"
  | "uploaded"
  | "processing"
  | "ready_for_review"
  | "reviewed"
  | "error";

export const WORKFLOW_STATUS_LABELS: Record<WorkflowStatus, string> = {
  upload_pending: "Upload Pending",
  uploaded: "Uploaded",
  processing: "Processing",
  ready_for_review: "Ready for Review",
  reviewed: "Reviewed",
  error: "Error",
};

export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger";

export const WORKFLOW_STATUS_TONES: Record<WorkflowStatus, StatusTone> = {
  upload_pending: "neutral",
  uploaded: "info",
  processing: "warning",
  ready_for_review: "info",
  reviewed: "success",
  error: "danger",
};

export type AppRole = "athlete" | "parent" | "coach" | "trainer" | "admin";

export const ROLE_LABELS: Record<AppRole, string> = {
  athlete: "Athlete",
  parent: "Parent",
  coach: "Coach",
  trainer: "Trainer",
  admin: "Admin",
};

export const ONBOARDING_ROLES: AppRole[] = ["athlete", "parent", "coach", "trainer"];

export type PlaySide = "offense" | "defense" | "neutral" | "special";

export const PLAY_SIDE_LABELS: Record<PlaySide, string> = {
  offense: "Offense",
  defense: "Defense",
  neutral: "Neutral",
  special: "Special",
};

export type DataSource = "manual" | "ai" | "ai_corrected";

export const DATA_SOURCE_LABELS: Record<DataSource, string> = {
  manual: "Manual entry",
  ai: "AI generated",
  ai_corrected: "AI, user corrected",
};

/** Universal handedness options; sports that don't use it simply omit the field. */
export const DOMINANT_HAND_OPTIONS = [
  { value: "right", label: "Right" },
  { value: "left", label: "Left" },
  { value: "both", label: "Both" },
];

export const PLAYBACK_SPEEDS = [0.5, 1, 1.25, 1.5, 2, 3];

export type SportRecord = {
  id: string;
  key: string;
  name: string;
  is_active: boolean;
  sort_order: number;
};

export type SportPosition = {
  id: string;
  sport_id: string;
  key: string;
  name: string;
  abbreviation: string | null;
  sort_order: number;
};

export type EventTypeRecord = {
  id: string;
  sport_id: string;
  key: string;
  name: string;
  default_side: PlaySide;
  subtypes: string[];
  outcomes: string[];
  sort_order: number;
};
