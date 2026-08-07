/**
 * Server-only YouTube provider adapter.
 *
 * Only officially supported, public endpoints are used. We never download,
 * rip, cache, rehost or transcode YouTube audiovisual content — playback is
 * always the official embedded player.
 *
 * When YouTube Data API credentials are added later they are read here from
 * the server environment and never reach the browser.
 */

export type YouTubeMetadata = {
  title: string | null;
  authorName: string | null;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  /** How the metadata was obtained. */
  retrievedFrom: "oembed" | "data_api" | "unavailable";
};

export function hasYouTubeApiCredentials(): boolean {
  return Boolean(process.env["YOUTUBE_API_KEY"]);
}

export async function fetchYouTubeOEmbed(videoId: string): Promise<YouTubeMetadata> {
  const target = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`,
  )}`;
  try {
    const response = await fetch(target, { headers: { accept: "application/json" } });
    if (!response.ok) {
      return {
        title: null,
        authorName: null,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        width: null,
        height: null,
        retrievedFrom: "unavailable",
      };
    }
    const payload = (await response.json()) as Record<string, unknown>;
    return {
      title: typeof payload["title"] === "string" ? payload["title"] : null,
      authorName: typeof payload["author_name"] === "string" ? payload["author_name"] : null,
      thumbnailUrl:
        typeof payload["thumbnail_url"] === "string"
          ? payload["thumbnail_url"]
          : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      width: typeof payload["width"] === "number" ? payload["width"] : null,
      height: typeof payload["height"] === "number" ? payload["height"] : null,
      retrievedFrom: "oembed",
    };
  } catch {
    return {
      title: null,
      authorName: null,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      width: null,
      height: null,
      retrievedFrom: "unavailable",
    };
  }
}