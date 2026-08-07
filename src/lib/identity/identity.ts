/**
 * Player identity vocabulary. Sport-agnostic on purpose: teams, memberships and
 * reference media mean the same thing in every sport.
 */

export type PlayerReferenceType =
  | "headshot"
  | "full_body"
  | "practice"
  | "game_crop"
  | "reference_video"
  | "other";

export const REFERENCE_TYPE_LABELS: Record<PlayerReferenceType, string> = {
  headshot: "Headshot",
  full_body: "Full Body",
  practice: "Practice",
  game_crop: "Game Crop",
  reference_video: "Reference Video",
  other: "Other",
};

/** Types a user can upload today. Game crops arrive from AI review in a later phase. */
export const UPLOADABLE_REFERENCE_TYPES: PlayerReferenceType[] = [
  "headshot",
  "full_body",
  "practice",
  "reference_video",
  "other",
];

export const VIDEO_REFERENCE_TYPES: PlayerReferenceType[] = ["reference_video"];

export type ExternalLinkProvider = "instagram" | "youtube" | "hudl" | "twitter" | "other";

export const EXTERNAL_LINK_LABELS: Record<ExternalLinkProvider, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  hudl: "Hudl",
  twitter: "X / Twitter",
  other: "Other",
};

export const EXTERNAL_LINK_PROVIDERS: ExternalLinkProvider[] = [
  "instagram",
  "youtube",
  "hudl",
  "twitter",
  "other",
];

export const TEAM_LEVELS = [
  "Varsity",
  "JV",
  "Freshman",
  "AAU / Club",
  "Skills Academy",
  "Summer League",
  "College",
  "Other",
];

/* ----------------------------- identity readiness ---------------------------- */

export type IdentityTier = "incomplete" | "good" | "excellent";

export const IDENTITY_TIER_LABELS: Record<IdentityTier, string> = {
  incomplete: "Incomplete",
  good: "Good",
  excellent: "Excellent",
};

export type IdentityCheck = {
  key: string;
  label: string;
  met: boolean;
  hint: string;
};

export type IdentityScore = {
  tier: IdentityTier;
  met: number;
  total: number;
  percent: number;
  checks: IdentityCheck[];
};

export function computeIdentityScore(input: {
  photoCount: number;
  videoCount: number;
  gameCropCount: number;
  hasCurrentTeam: boolean;
  hasJerseyNumber: boolean;
  hasPosition: boolean;
}): IdentityScore {
  const checks: IdentityCheck[] = [
    {
      key: "photos",
      label: "Reference photos",
      met: input.photoCount >= 2,
      hint: "Add at least two clear photos (headshot plus full body).",
    },
    {
      key: "videos",
      label: "Reference videos",
      met: input.videoCount >= 1,
      hint: "A short clip of the athlete moving helps future identification.",
    },
    {
      key: "team",
      label: "Current team",
      met: input.hasCurrentTeam,
      hint: "Mark one membership as the current team.",
    },
    {
      key: "jersey",
      label: "Jersey number",
      met: input.hasJerseyNumber,
      hint: "Set the jersey number on the current membership.",
    },
    {
      key: "position",
      label: "Current position",
      met: input.hasPosition,
      hint: "Set the position on the current membership.",
    },
    {
      key: "crops",
      label: "Game crops",
      met: input.gameCropCount >= 1,
      hint: "Confirmed game crops will be saved automatically during AI review.",
    },
  ];

  const met = checks.filter((check) => check.met).length;
  const total = checks.length;
  const percent = Math.round((met / total) * 100);
  const tier: IdentityTier = met >= 5 ? "excellent" : met >= 3 ? "good" : "incomplete";
  return { tier, met, total, percent, checks };
}