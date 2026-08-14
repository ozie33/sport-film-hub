/**
 * Shared, client-safe vocabulary for the AI post-processing layer.
 *
 * Everything here operates on the structured data a human already created by
 * marking plays (timestamps, event tags, outcomes, notes, ratings). The AI
 * never watches video, so copy in the UI must always say "reviewed plays".
 */

export const REEL_MODES = [
  {
    key: "best_plays",
    label: "Best Plays",
    hint: "Highest-rated, highest-impact reviewed plays.",
  },
  { key: "scoring", label: "Scoring Reel", hint: "Finishes, jumpers and scoring attacks." },
  {
    key: "complete_review",
    label: "Complete Player Review",
    hint: "A balanced look at everything reviewed — good and bad.",
  },
  { key: "defense", label: "Defense Reel", hint: "On-ball defense, help, closeouts, steals." },
  {
    key: "development",
    label: "Development Reel",
    hint: "Teaching clips: mistakes, reads and habits to work on.",
  },
  { key: "custom", label: "Custom", hint: "Describe the reel you want in your own words." },
] as const;

export type ReelMode = (typeof REEL_MODES)[number]["key"];

export const REEL_MODE_LABELS: Record<string, string> = Object.fromEntries(
  REEL_MODES.map((mode) => [mode.key, mode.label]),
);

export const REGENERATE_OPTIONS = [
  { key: "shorter", label: "Shorter" },
  { key: "more_scoring", label: "More scoring" },
  { key: "more_defense", label: "More defense" },
  { key: "more_variety", label: "More variety" },
  { key: "more_chronological", label: "More chronological" },
  { key: "best_only", label: "Best plays only" },
] as const;

export type RegenerateOption = (typeof REGENERATE_OPTIONS)[number]["key"];

export type OrganizeResult = {
  reviewedClipCount: number;
  playlists: { id: string; name: string; description: string | null; clipCount: number }[];
  themes: string[];
  tagNormalizations: { from: string; to: string }[];
};

export type GameStoryContent = {
  headline: string;
  narrative: string;
  counts: { label: string; value: number }[];
  strengths: string[];
  developmentThemes: string[];
  decisionPatterns: string[];
  suggestedPlaylist: { name: string; description: string };
};

export type DevelopmentSummaryContent = {
  topStrength: string;
  biggestPriority: string;
  patternsObserved: string[];
  recommendedFilmReview: string[];
  suggestedWorkoutFocus: string[];
  summary: string;
};

/** Consistent, honest labeling for every AI surface in the review workflow. */
export function reviewedPlaysLabel(count: number) {
  return `${count} reviewed play${count === 1 ? "" : "s"}`;
}

export const AI_SCOPE_DISCLAIMER =
  "Generated from the plays you marked — unmarked parts of the game were not reviewed.";