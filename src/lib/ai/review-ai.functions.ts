import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const organizeReviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { gameId?: string | null; playerId?: string | null }) => input)
  .handler(async ({ data, context }) => {
    const { organizeReview } = await import("@/lib/ai/review-ai.server");
    return organizeReview(context.supabase, context.userId, data);
  });

export const generatePlaylistFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { prompt: string; gameId?: string | null; playerId?: string | null }) => input,
  )
  .handler(async ({ data, context }) => {
    const { generatePlaylistFromPrompt } = await import("@/lib/ai/review-ai.server");
    return generatePlaylistFromPrompt(context.supabase, context.userId, data);
  });

export const buildReelFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      mode: string;
      playerId?: string | null;
      gameIds?: string[] | null;
      customPrompt?: string | null;
      maxClips?: number | null;
      adjustments?: string[] | null;
      parentReelId?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { buildReel } = await import("@/lib/ai/review-ai.server");
    return buildReel(context.supabase, context.userId, data);
  });

export const generateGameStoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { gameId: string }) => input)
  .handler(async ({ data, context }) => {
    const { generateGameStory } = await import("@/lib/ai/review-ai.server");
    return generateGameStory(context.supabase, context.userId, data.gameId);
  });

export const generateDevelopmentSummaryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { playerId: string }) => input)
  .handler(async ({ data, context }) => {
    const { generateDevelopmentSummary } = await import("@/lib/ai/review-ai.server");
    return generateDevelopmentSummary(context.supabase, context.userId, data.playerId);
  });