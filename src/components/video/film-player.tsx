import { forwardRef } from "react";
import { ExternalLink, Film } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NativeVideoPlayer } from "@/components/video/native-video-player";
import { YouTubePlayer } from "@/components/video/youtube-player";
import { SourceBadge } from "@/components/video/source-badge";
import { useSignedFilmUrl } from "@/lib/data/video-queries";
import { PROVIDER_LABELS, playerKindFor, type VideoProviderKey } from "@/lib/video/capabilities";
import type { FilmPlayerHandle } from "@/components/video/film-player-types";

/** The minimum an asset must expose for playback — keeps clip joins usable too. */
export type FilmSource = {
  id: string;
  provider: string;
  access_level: string;
  external_video_id: string | null;
  external_url: string | null;
  embed_url: string | null;
  storage_path: string | null;
  label: string;
  thumbnail_url: string | null;
  duration: number | null;
};

/**
 * Source-aware player. The rest of the app never branches on provider —
 * it renders this and talks to the returned handle.
 */
export const FilmPlayer = forwardRef<
  FilmPlayerHandle,
  {
    asset: FilmSource | null | undefined;
    startSeconds?: number;
    onTimeUpdate?: (seconds: number) => void;
    onDuration?: (seconds: number) => void;
  }
>(function FilmPlayer({ asset, startSeconds, onTimeUpdate, onDuration }, ref) {
  const { data: signedUrl, isPending: signing } = useSignedFilmUrl(
    asset?.provider === "upload" ? asset.storage_path : null,
  );

  if (!asset) {
    return (
      <FilmSurfaceMessage
        title="No film attached"
        body="Attach an upload, a YouTube link or a Hudl link to start reviewing this game."
      />
    );
  }

  const kind = playerKindFor(asset.provider, asset.access_level);

  if (kind === "native") {
    if (signing) {
      return <FilmSurfaceMessage title="Preparing film…" body="Fetching a secure playback link." />;
    }
    if (!signedUrl) {
      return (
        <FilmSurfaceMessage
          title="Playback unavailable"
          body="The stored file could not be opened. Re-upload the film to fix it."
        />
      );
    }
    return (
      <NativeVideoPlayer
        ref={ref}
        src={signedUrl}
        poster={asset.thumbnail_url}
        {...(onTimeUpdate ? { onTimeUpdate } : {})}
        {...(onDuration ? { onDuration } : {})}
      />
    );
  }

  if (kind === "youtube" && asset.external_video_id) {
    return (
      <YouTubePlayer
        ref={ref}
        videoId={asset.external_video_id}
        {...(startSeconds ? { startSeconds } : {})}
        {...(onTimeUpdate ? { onTimeUpdate } : {})}
        {...(onDuration ? { onDuration } : {})}
      />
    );
  }

  if (kind === "link") {
    return <LinkedSourceCard asset={asset} />;
  }

  return (
    <FilmSurfaceMessage
      title="This source can't play in-app"
      body="Open it with the provider, or upload the file to unlock the full film workflow."
      action={asset.external_url}
      provider={asset.provider}
    />
  );
});

/** Hudl and other link-only sources: reference the film, never re-host it. */
function LinkedSourceCard({ asset }: { asset: FilmSource }) {
  const label = PROVIDER_LABELS[asset.provider as VideoProviderKey] ?? "the provider";
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid aspect-video place-items-center bg-gradient-to-br from-muted/60 to-background p-6 text-center">
        <div className="max-w-md space-y-3">
          <span className="mx-auto grid size-12 place-items-center rounded-full border border-border bg-muted">
            <Film className="size-5 text-muted-foreground" />
          </span>
          <SourceBadge provider={asset.provider} />
          <h3 className="text-lg font-semibold">Watch on {label}</h3>
          <p className="text-sm text-muted-foreground">
            This film stays on {label}. We keep the reference and your timestamps here — playback
            happens in {label}, and nothing is downloaded or copied.
          </p>
          {asset.external_url ? (
            <Button asChild>
              <a href={asset.external_url} target="_blank" rel="noreferrer noopener">
                Open in {label}
                <ExternalLink className="size-4" />
              </a>
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground">
            You can still log plays with manual timestamps below.
          </p>
        </div>
      </div>
    </div>
  );
}

function FilmSurfaceMessage({
  title,
  body,
  action,
  provider,
}: {
  title: string;
  body: string;
  action?: string | null;
  provider?: string;
}) {
  return (
    <div className="grid aspect-video place-items-center rounded-xl border border-dashed border-border bg-card p-6 text-center">
      <div className="max-w-sm space-y-2">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{body}</p>
        {action ? (
          <Button variant="outline" asChild>
            <a href={action} target="_blank" rel="noreferrer noopener">
              Open in {PROVIDER_LABELS[provider as VideoProviderKey] ?? "provider"}
              <ExternalLink className="size-4" />
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}