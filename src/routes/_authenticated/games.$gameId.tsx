import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Play, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge, Tag } from "@/components/common/status-badge";
import { SectionCard, StatCard } from "@/components/common/stat-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AddFilmPanel } from "@/components/video/add-film-panel";
import { ShareWithPlayerDialog } from "@/components/sharing/share-with-player-dialog";
import { FilmPlayer } from "@/components/video/film-player";
import { FilmSourceList } from "@/components/video/film-source-list";
import { MarkPlayPanel } from "@/components/video/mark-play-panel";
import { CapabilityList, SourceBadge } from "@/components/video/source-badge";
import { PlayerIdentitySummary } from "@/components/players/player-identity-summary";
import { AiReadinessPlaceholders } from "@/components/players/ai-readiness-placeholders";
import type { FilmPlayerHandle } from "@/components/video/film-player-types";
import { PLAY_SIDE_LABELS } from "@/lib/domain";
import {
  useDeleteEvent,
  useEventTypes,
  useGame,
  useGameEvents,
  useSportPositions,
} from "@/lib/data/queries";
import { teamDisplayName } from "@/lib/data/identity-queries";
import { useVideoAssets } from "@/lib/data/video-queries";
import { capabilitiesFor } from "@/lib/video/capabilities";
import { formatClock, formatGameDate, fullName } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/games/$gameId")({
  head: () => ({
    meta: [
      { title: "Game detail — CourtBase" },
      { name: "description", content: "Review a game's event timeline, clips and analysis status." },
      { property: "og:title", content: "Game detail — CourtBase" },
      { property: "og:description", content: "Event timeline, clips and analysis status for a game." },
    ],
  }),
  errorComponent: () => (
    <AppShell>
      <EmptyState title="We couldn't load this game" description="Please refresh and try again." />
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <EmptyState title="Game not found" description="This game may have been deleted." />
    </AppShell>
  ),
  component: GameDetail,
});

function GameDetail() {
  const { gameId } = Route.useParams();
  const { data: game, isLoading } = useGame(gameId);
  const { data: events = [] } = useGameEvents(gameId);
  const { data: eventTypes = [] } = useEventTypes(game?.sport_id ?? null);
  const { data: assets = [] } = useVideoAssets(gameId);
  const { data: gamePositions = [] } = useSportPositions(game?.sport_id ?? null);
  const deleteEvent = useDeleteEvent(gameId);

  const playerRef = useRef<FilmPlayerHandle | null>(null);
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [showAddFilm, setShowAddFilm] = useState(false);

  useEffect(() => {
    if (assets.length === 0) {
      setActiveAssetId(null);
      return;
    }
    if (!activeAssetId || !assets.some((asset) => asset.id === activeAssetId)) {
      setActiveAssetId(assets[0]!.id);
    }
  }, [assets, activeAssetId]);

  const activeAsset = assets.find((asset) => asset.id === activeAssetId) ?? null;
  const capabilities = capabilitiesFor(activeAsset?.provider, activeAsset?.access_level);
  const gamePlayers = (game?.game_players ?? []).map((link) => ({
    player_id: link.player_id,
    name: fullName(link.players?.first_name, link.players?.last_name) || "Player",
  }));
  const primaryLink =
    (game?.game_players ?? []).find((link) => link.is_primary) ?? (game?.game_players ?? [])[0];

  const summary = useMemo(() => {
    const offense = events.filter((item) => item.offense_or_defense === "offense").length;
    const defense = events.filter((item) => item.offense_or_defense === "defense").length;
    return [
      { label: "Marked plays", value: String(events.length) },
      { label: "Offense", value: String(offense) },
      { label: "Defense", value: String(defense) },
      { label: "Film sources", value: String(assets.length) },
    ];
  }, [events, assets]);

  function seekTo(seconds: number, assetId: string | null) {
    if (assetId && assetId !== activeAssetId) {
      setActiveAssetId(assetId);
      return;
    }
    if (!capabilities.timestamp_seeking) return;
    playerRef.current?.seek(Math.max(0, seconds - 1));
    playerRef.current?.play();
  }

  if (isLoading) {
    return (
      <AppShell>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </AppShell>
    );
  }

  if (!game) {
    return (
      <AppShell>
        <EmptyState
          title="Game not found"
          description="This game may have been deleted."
          action={
            <Button asChild>
              <Link to="/games">Back to games</Link>
            </Button>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Button variant="ghost" size="sm" className="w-fit" asChild>
        <Link to="/games">
          <ArrowLeft className="mr-1 size-4" /> All games
        </Link>
      </Button>

      <PageHeader
        eyebrow={`vs ${game.opponent || "Unknown opponent"}`}
        title={game.title}
        description={`${formatGameDate(game.game_date)} · ${game.is_home ? "Home" : "Away"}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={game.video_status} />
            <StatusBadge status={game.analysis_status} />
            <ShareWithPlayerDialog
              resourceType="game"
              resourceId={game.id}
              resourceName={game.title}
            />
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summary.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </div>

      {primaryLink ? (
        <PlayerIdentitySummary
          playerId={primaryLink.player_id}
          {...(primaryLink.players
            ? {
                playerName: {
                  first: primaryLink.players.first_name,
                  last: primaryLink.players.last_name,
                },
              }
            : {})}
          gameContext={{
            teamName: game.teams ? teamDisplayName(game.teams) : null,
            jerseyNumber: game.jersey_number,
            positionName:
              gamePositions.find((position) => position.id === game.position_id)?.name ?? null,
            season: game.season,
            primaryColor: game.uniform_primary_color,
            secondaryColor: game.uniform_secondary_color,
          }}
        />
      ) : null}

      <AiReadinessPlaceholders />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <FilmPlayer
            key={activeAsset?.id ?? "empty"}
            ref={playerRef}
            asset={activeAsset}
            onTimeUpdate={setCurrentTime}
          />

          {activeAsset ? (
            <div className="flex flex-wrap items-center gap-2">
              <SourceBadge provider={activeAsset.provider} />
              <span className="text-sm text-muted-foreground">{activeAsset.label}</span>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                Playhead {formatClock(currentTime)}
              </span>
            </div>
          ) : null}

          <SectionCard title="Event Timeline" description="Chronological marked plays">
            {events.length === 0 ? (
              <EmptyState
                title="No plays marked yet"
                description="Use Mark Play to log In and Out points. AI-generated events will merge into this same timeline later."
              />
            ) : (
              <ol className="space-y-2">
                {events.map((item) => (
                  <li
                    key={item.id}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => seekTo(item.start_time, item.video_asset_id)}
                      disabled={!item.video_asset_id && !capabilities.timestamp_seeking}
                      className="label-caps inline-flex items-center gap-1 rounded-md bg-background px-2 py-1 text-[11px] tabular-nums hover:text-primary disabled:opacity-60"
                      aria-label={`Jump to ${formatClock(item.start_time)}`}
                    >
                      <Play className="size-3" />
                      {formatClock(item.start_time)}
                    </button>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {eventTypes.find((type) => type.key === item.event_type_key)?.name ??
                          item.event_type_key}
                        {item.event_subtype ? ` — ${item.event_subtype}` : ""}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {item.outcome ? <Tag>{item.outcome}</Tag> : null}
                        <Tag>
                          {PLAY_SIDE_LABELS[
                            item.offense_or_defense as keyof typeof PLAY_SIDE_LABELS
                          ] ?? item.offense_or_defense}
                        </Tag>
                        <Tag>{item.source === "manual" ? "Manual" : "AI"}</Tag>
                      </div>
                      {item.notes ? (
                        <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p>
                      ) : null}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete event"
                      onClick={() => deleteEvent.mutate(item.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard
            title="Mark Play"
            description={
              activeAsset
                ? "Set In and Out points, label the play, save."
                : "Attach film to start marking plays."
            }
          >
            <MarkPlayPanel
              gameId={gameId}
              sportId={game.sport_id}
              videoAssetId={activeAsset?.id ?? null}
              eventTypes={eventTypes}
              players={gamePlayers}
              playerRef={playerRef}
              canSeek={capabilities.timestamp_seeking}
              currentTime={currentTime}
            />
          </SectionCard>

          <SectionCard
            title="Film Sources"
            description="Uploads, YouTube and Hudl links live side by side"
            actions={
              <Button variant="outline" size="sm" onClick={() => setShowAddFilm((value) => !value)}>
                <Plus className="size-4" /> Add film
              </Button>
            }
          >
            <div className="space-y-4">
              <FilmSourceList
                assets={assets}
                activeId={activeAssetId}
                onSelect={setActiveAssetId}
              />
              {showAddFilm || assets.length === 0 ? (
                <AddFilmPanel
                  gameId={gameId}
                  makePrimary={assets.length === 0}
                  onAdded={() => setShowAddFilm(false)}
                />
              ) : null}
            </div>
          </SectionCard>

          {activeAsset ? (
            <SectionCard
              title="Source Capabilities"
              description="What this film supports right now"
            >
              <CapabilityList
                provider={activeAsset.provider}
                accessLevel={activeAsset.access_level}
              />
            </SectionCard>
          ) : null}

          <SectionCard title="Players in this Game">
            {(game.game_players ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No player linked to this game yet.</p>
            ) : (
              <ul className="space-y-2">
                {game.game_players.map((link) => (
                  <li key={link.player_id} className="flex items-center justify-between gap-2">
                    <Link
                      to="/players/$playerId"
                      params={{ playerId: link.player_id }}
                      className="truncate text-sm underline-offset-4 hover:underline"
                    >
                      {fullName(link.players?.first_name, link.players?.last_name) || "Player"}
                    </Link>
                    {link.is_primary ? <Tag>Primary</Tag> : null}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </AppShell>
  );
}
