import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Fetch officially-available YouTube metadata for a video id. */
export const getYouTubeMetadata = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { videoId: string }) => {
    if (!/^[A-Za-z0-9_-]{11}$/.test(input.videoId)) throw new Error("Invalid YouTube video id");
    return input;
  })
  .handler(async ({ data }) => {
    const { fetchYouTubeOEmbed } = await import("./youtube.server");
    return fetchYouTubeOEmbed(data.videoId);
  });

/** What the Hudl adapter can currently do — honest, never faked. */
export const getHudlAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { resolveHudlAccessLevel } = await import("./hudl.server");
    return resolveHudlAccessLevel();
  });

/** Connection state for the Settings → Connected Services panel. */
export const getProviderConnectionStates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const [{ hasYouTubeApiCredentials }, { hudlCredentialState }] = await Promise.all([
      import("./youtube.server"),
      import("./hudl.server"),
    ]);
    const hudl = hudlCredentialState();
    return {
      youtube: {
        status: "connected" as const,
        hasCredentials: hasYouTubeApiCredentials(),
        detail: hasYouTubeApiCredentials()
          ? "YouTube API credentials are configured. Public links play through the official embedded player."
          : "Public YouTube links work today through the official embedded player. API credentials are only needed for private videos and richer metadata.",
      },
      hudl,
    };
  });