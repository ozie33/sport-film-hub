/**
 * Product analytics event vocabulary for the Smart Review + AI post-processing
 * funnel. Names are stable — the admin funnel view keys off them, so renaming
 * one breaks historical comparison.
 */
export const PRODUCT_EVENTS = {
  youtubeLinkAdded: "youtube_link_added",
  filmSourceAdded: "film_source_added",
  smartReviewStarted: "smart_review_started",
  playMarked: "play_marked",
  organizeReviewUsed: "organize_review_used",
  aiPlaylistCreated: "ai_playlist_created",
  buildReelUsed: "build_reel_used",
  reelCompleted: "reel_completed",
  reelShared: "reel_shared",
  gameStoryViewed: "game_story_viewed",
  developmentSummaryViewed: "development_summary_viewed",
} as const;

export type ProductEventName = (typeof PRODUCT_EVENTS)[keyof typeof PRODUCT_EVENTS];

/** Ordered funnel used by the internal analytics view. */
export const FUNNEL_STEPS: { key: string; label: string }[] = [
  { key: "youtube_link_added", label: "YouTube link added" },
  { key: "smart_review_started", label: "Smart Review started" },
  { key: "first_play_marked", label: "First play marked" },
  { key: "five_plays_marked", label: "5 plays marked" },
  { key: "ten_plays_marked", label: "10 plays marked" },
  { key: "organize_review_used", label: "Organize My Review used" },
  { key: "ai_playlist_created", label: "AI playlist created" },
  { key: "build_reel_used", label: "Build Reel used" },
  { key: "reel_completed", label: "Reel completed" },
  { key: "reel_shared", label: "Reel shared" },
  { key: "game_story_viewed", label: "Game Story viewed" },
  { key: "development_summary_viewed", label: "Development Summary viewed" },
];
