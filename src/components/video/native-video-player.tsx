import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Maximize, Pause, Play, Volume2, VolumeX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { PLAYBACK_SPEEDS } from "@/lib/domain";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FilmPlayerHandle } from "@/components/video/film-player-types";

/** Native player for film we host ourselves — full control surface. */
export const NativeVideoPlayer = forwardRef<
  FilmPlayerHandle,
  {
    src: string;
    poster?: string | null;
    onTimeUpdate?: (seconds: number) => void;
    onDuration?: (seconds: number) => void;
  }
>(function NativeVideoPlayer({ src, poster, onTimeUpdate, onDuration }, ref) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);

  useImperativeHandle(
    ref,
    (): FilmPlayerHandle => ({
      play: () => void videoRef.current?.play(),
      pause: () => videoRef.current?.pause(),
      togglePlay: () => {
        const element = videoRef.current;
        if (!element) return;
        if (element.paused) void element.play();
        else element.pause();
      },
      seek: (seconds) => {
        if (videoRef.current) videoRef.current.currentTime = Math.max(0, seconds);
      },
      getCurrentTime: () => videoRef.current?.currentTime ?? 0,
      getDuration: () => videoRef.current?.duration ?? 0,
      setPlaybackRate: (nextRate) => {
        if (videoRef.current) videoRef.current.playbackRate = nextRate;
        setRate(nextRate);
      },
      isReady: () => Boolean(videoRef.current),
    }),
    [],
  );

  const handleTimeUpdate = useCallback(() => {
    const element = videoRef.current;
    if (!element) return;
    setCurrent(element.currentTime);
    onTimeUpdate?.(element.currentTime);
  }, [onTimeUpdate]);

  useEffect(() => {
    const element = videoRef.current;
    if (element) element.playbackRate = rate;
  }, [rate, src]);

  return (
    <div ref={shellRef} className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative aspect-video w-full bg-black">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          src={src}
          poster={poster ?? undefined}
          className="size-full"
          playsInline
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={(event) => {
            const value = event.currentTarget.duration;
            if (Number.isFinite(value)) {
              setDuration(value);
              onDuration?.(Math.round(value));
            }
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
      </div>

      <div className="space-y-2 border-t border-border px-3 py-2">
        <Slider
          aria-label="Timeline scrubber"
          value={[Math.min(current, duration || 0)]}
          max={duration || 1}
          step={0.1}
          onValueChange={([value]) => {
            if (videoRef.current && typeof value === "number") {
              videoRef.current.currentTime = value;
              setCurrent(value);
            }
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={playing ? "Pause" : "Play"}
              onClick={() => {
                const element = videoRef.current;
                if (!element) return;
                if (element.paused) void element.play();
                else element.pause();
              }}
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatClock(current)} / {formatClock(duration)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <span className="label-caps mr-1 text-[10px] text-muted-foreground">Speed</span>
            {PLAYBACK_SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => {
                  setRate(speed);
                  if (videoRef.current) videoRef.current.playbackRate = speed;
                }}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-xs tabular-nums transition-colors",
                  speed === rate
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {speed}x
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label={volume === 0 ? "Unmute" : "Mute"}
              onClick={() => {
                const next = volume === 0 ? 1 : 0;
                setVolume(next);
                if (videoRef.current) videoRef.current.volume = next;
              }}
            >
              {volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </Button>
            <Slider
              aria-label="Volume"
              className="w-20"
              value={[volume]}
              max={1}
              step={0.05}
              onValueChange={([value]) => {
                if (typeof value !== "number") return;
                setVolume(value);
                if (videoRef.current) videoRef.current.volume = value;
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Fullscreen"
              onClick={() => void shellRef.current?.requestFullscreen?.()}
            >
              <Maximize className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});