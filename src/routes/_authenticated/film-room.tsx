import { createFileRoute, Link } from "@tanstack/react-router";
import { Film } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { ClipCard } from "@/components/common/clip-card";
import { DemoNotice } from "@/components/common/demo-badge";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/stat-card";
import { Tag } from "@/components/common/status-badge";
import { VideoPlaceholder } from "@/components/common/video-placeholder";
import { Button } from "@/components/ui/button";
import { PlayerCut } from "@/components/video/player-cut";
import { useClips, type ClipRecord } from "@/lib/data/video-queries";
import { useGames, useProfile } from "@/lib/data/queries";
import { demoClips, demoPlaylists } from "@/lib/demo/demo-data";
import { formatDuration, fullName } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/film-room")({
  head: () => ({
    meta: [
      { title: "Film Room — CourtBase" },
      {
        name: "description",
        content: "Auto-generated playlists that turn tagged events into review-ready film.",
      },
      { property: "og:title", content: "Film Room — CourtBase" },
      { property: "og:description", content: "Auto-generated playlists for review-ready film." },
    ],
  }),
  component: FilmRoom,
});

function FilmRoom() {
  const { data: profile } = useProfile();
  const { data: games = [] } = useGames();
  const { data: clips = [] } = useClips();
  const demoMode = profile?.demo_mode ?? false;
  const [activeKey, setActiveKey] = useState(demoPlaylists[0]!.system_key);
  const [realKey, setRealKey] = useState("all");

  const playlists = useMemo(() => buildPlaylists(clips), [clips]);

  if (clips.length > 0) {
    const active = playlists.find((playlist) => playlist.key === realKey) ?? playlists[0]!;
    return (
      <AppShell>
        <PageHeader
          eyebrow="Film Room"
          title="Film Room"
          description="Playlists build themselves from the plays you mark on each game."
        />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
          <SectionCard title="Playlists" description={`${playlists.length} auto-generated`}>
            <ul className="space-y-1.5">
              {playlists.map((playlist) => (
                <li key={playlist.key}>
                  <button
                    type="button"
                    onClick={() => setRealKey(playlist.key)}
                    className={cn(
                      "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      playlist.key === active.key
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="truncate">{playlist.name}</span>
                    <span className="shrink-0 text-xs tabular-nums">{playlist.clips.length}</span>
                  </button>
                </li>
              ))}
            </ul>
          </SectionCard>

          <div className="space-y-6">
            <SectionCard
              title={`${active.name} — Player Cut`}
              description="Clips play back to back straight from the original source"
              actions={<Tag>{active.clips.length} clips</Tag>}
            >
              <PlayerCut clips={active.clips} />
            </SectionCard>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!demoMode) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="Film Room"
          title="Film Room"
          description="Playlists are generated automatically from each game's tagged events."
        />
        <EmptyState
          icon={<Film className="size-8" />}
          title="Your Film Room is empty."
          description={
            games.length === 0
              ? "Add a game to begin building your player-development library. Playlists appear once events are tagged or analyzed."
              : "Attach film to a game and mark plays — playlists appear here automatically."
          }
          action={
            <Button asChild>
              <Link to="/games" search={{ add: games.length === 0 ? true : undefined }}>
                {games.length === 0 ? "Analyze Your First Game" : "Go to games"}
              </Link>
            </Button>
          }
        />
      </AppShell>
    );
  }

  const active = demoPlaylists.find((playlist) => playlist.system_key === activeKey) ?? demoPlaylists[0]!;
  const clips = demoClips.filter((clip) =>
    active.side === "all" ? true : clip.side === active.side,
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow="Film Room"
        title="Film Room"
        description="Playlists are generated automatically from each game's tagged events."
      />

      <DemoNotice>Sample playlists preview how your film room will be organized.</DemoNotice>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <SectionCard title="Playlists" description={`${demoPlaylists.length} auto-generated`}>
          <ul className="space-y-1.5">
            {demoPlaylists.map((playlist) => (
              <li key={playlist.system_key}>
                <button
                  type="button"
                  onClick={() => setActiveKey(playlist.system_key)}
                  className={cn(
                    "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    playlist.system_key === active.system_key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="truncate">{playlist.name}</span>
                  <span className="shrink-0 text-xs tabular-nums">{playlist.clip_count}</span>
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>

        <div className="space-y-6">
          <VideoPlaceholder title={active.name} subtitle={`${active.player_name} · ${active.game_title}`} />

          <SectionCard
            title={active.name}
            description={`${active.clip_count} clips · ${formatDuration(active.duration_seconds)}`}
            actions={<Tag>{active.side === "all" ? "Offense & defense" : active.side}</Tag>}
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {clips.map((clip) => (
                <ClipCard
                  key={clip.id}
                  playerName={clip.player_name}
                  category={clip.category}
                  gameTitle={clip.game_title}
                  timestamp={clip.timestamp}
                  score={clip.score}
                />
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
