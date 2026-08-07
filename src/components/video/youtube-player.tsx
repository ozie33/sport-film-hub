import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import { PLAYBACK_SPEEDS } from "@/lib/domain";
import { cn } from "@/lib/utils";
import type { FilmPlayerHandle } from "@/components/video/film-player-types";

/**
 * Official YouTube IFrame Player API. The film stays hosted on YouTube with
 * its own branding and controls — we only seek and read the playhead.
 */

type YouTubePlayerInstance = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  setPlaybackRate: (rate: number) => void;
  destroy: () => void;
};

type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: { onReady?: () => void };
    },
  ) => YouTubePlayerInstance;
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeApi> | null = null;

function loadYouTubeApi(): Promise<YouTubeApi> {
  if (typeof window === "undefined") return Promise.reject(new Error("No browser context"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => reject(new Error("Could not load the YouTube player."));
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube player unavailable."));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

export const YouTubePlayer = forwardRef<
  FilmPlayerHandle,
  {
    videoId: string;
    startSeconds?: number;
    onTimeUpdate?: (seconds: number) => void;
    onDuration?: (seconds: number) => void;
  }
>(function YouTubePlayer({ videoId, startSeconds, onTimeUpdate, onDuration }, ref) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayerInstance | null>(null);
  const [ready, setReady] = useState(false);
  const [rate, setRate] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);

  useImperativeHandle(
    ref,
    (): FilmPlayerHandle => ({
      play: () => playerRef.current?.playVideo(),
      pause: () => playerRef.current?.pauseVideo(),
      togglePlay: () => {
        const player = playerRef.current;
        if (!player) return;
        // 1 === playing in the IFrame API.
        if (player.getPlayerState() === 1) player.pauseVideo();
        else player.playVideo();
      },
      seek: (seconds) => playerRef.current?.seekTo(Math.max(0, seconds), true),
      getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
      getDuration: () => playerRef.current?.getDuration() ?? 0,
      setPlaybackRate: (nextRate) => {
        playerRef.current?.setPlaybackRate(nextRate);
        setRate(nextRate);
      },
      isReady: () => Boolean(playerRef.current),
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const container = mountRef.current;
    if (!container) return;

    loadYouTubeApi()
      .then((api) => {
        if (cancelled || !mountRef.current) return;
        const host = document.createElement("div");
        mountRef.current.replaceChildren(host);
        playerRef.current = new api.Player(host, {
          videoId,
          playerVars: {
            playsinline: 1,
            rel: 0,
            modestbranding: 0,
            ...(startSeconds ? { start: Math.floor(startSeconds) } : {}),
          },
          events: {
            onReady: () => {
              if (cancelled) return;
              setReady(true);
              const duration = playerRef.current?.getDuration() ?? 0;
              if (duration > 0) onDuration?.(Math.round(duration));
            },
          },
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Could not load the YouTube player.");
        }
      });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  useEffect(() => {
    if (!ready || !onTimeUpdate) return;
    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (player) onTimeUpdate(player.getCurrentTime());
    }, 250);
    return () => window.clearInterval(timer);
  }, [ready, onTimeUpdate]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative aspect-video w-full bg-black [&_iframe]:size-full">
        <div ref={mountRef} className="size-full" />
        {loadError ? (
          <p className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-muted-foreground">
            {loadError}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2">
        <p className="text-xs text-muted-foreground">
          Playing on YouTube · seeking and speed only
        </p>
        <div className="flex flex-wrap items-center gap-1">
          <span className="label-caps mr-1 text-[10px] text-muted-foreground">Speed</span>
          {PLAYBACK_SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              disabled={!ready}
              onClick={() => {
                setRate(speed);
                playerRef.current?.setPlaybackRate(speed);
              }}
              className={cn(
                "rounded-md border px-2 py-0.5 text-xs tabular-nums transition-colors disabled:opacity-50",
                speed === rate
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});