import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard, StatCard } from "@/components/common/stat-card";
import { Tag } from "@/components/common/status-badge";
import { GameCard } from "@/components/games/game-card";
import { PlayerFormDialog } from "@/components/players/player-form-dialog";
import { PlayerTeamsTab } from "@/components/players/player-teams-tab";
import { ReferenceLibrary } from "@/components/players/reference-library";
import { IdentityScoreCard } from "@/components/players/identity-score-card";
import { AiReadinessPlaceholders } from "@/components/players/ai-readiness-placeholders";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeletePlayer, useGames, usePlayer, useSportPositions } from "@/lib/data/queries";
import {
  currentMembership,
  teamDisplayName,
  usePlayerMemberships,
  usePlayerReferences,
} from "@/lib/data/identity-queries";
import { computeIdentityScore } from "@/lib/identity/identity";
import { fullName, initials } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/players/$playerId")({
  head: () => ({
    meta: [
      { title: "Player profile — CourtBase" },
      { name: "description", content: "A player's games, development notes and profile details." },
      { property: "og:title", content: "Player profile — CourtBase" },
      { property: "og:description", content: "Games, development notes and profile details." },
    ],
  }),
  errorComponent: () => (
    <AppShell>
      <EmptyState title="We couldn't load this player" description="Please refresh and try again." />
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <EmptyState title="Player not found" description="This player may have been deleted." />
    </AppShell>
  ),
  component: PlayerDetail,
});

function PlayerDetail() {
  const { playerId } = Route.useParams();
  const { data: player, isLoading } = usePlayer(playerId);
  const { data: games = [] } = useGames();
  const { data: positions = [] } = useSportPositions(player?.sport_id ?? null);
  const { data: memberships = [] } = usePlayerMemberships(playerId);
  const { data: references = [] } = usePlayerReferences(playerId);
  const deletePlayer = useDeletePlayer();
  const [editOpen, setEditOpen] = useState(false);

  const playerGames = useMemo(
    () => games.filter((game) => (game.game_players ?? []).some((link) => link.player_id === playerId)),
    [games, playerId],
  );

  const positionName = positions.find((position) => position.id === player?.position_id)?.name;
  const membership = currentMembership(memberships);
  const photos = references.filter(
    (reference) =>
      reference.reference_type !== "reference_video" && reference.reference_type !== "game_crop",
  );
  const videos = references.filter((reference) => reference.reference_type === "reference_video");
  const crops = references.filter((reference) => reference.reference_type === "game_crop");
  const identityScore = computeIdentityScore({
    photoCount: photos.length,
    videoCount: videos.length,
    gameCropCount: crops.length,
    hasCurrentTeam: Boolean(membership),
    hasJerseyNumber: Boolean(membership?.jersey_number),
    hasPosition: Boolean(membership?.position_id ?? membership?.position_label),
  });

  async function handleDelete() {
    try {
      await deletePlayer.mutateAsync(playerId);
      toast.success("Player deleted");
      window.history.back();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the player");
    }
  }

  if (isLoading) {
    return (
      <AppShell>
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </AppShell>
    );
  }

  if (!player) {
    return (
      <AppShell>
        <EmptyState
          title="Player not found"
          description="This player may have been deleted."
          action={
            <Button asChild>
              <Link to="/players">Back to players</Link>
            </Button>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Button variant="ghost" size="sm" className="w-fit" asChild>
        <Link to="/players">
          <ArrowLeft className="mr-1 size-4" /> All players
        </Link>
      </Button>

      <PageHeader
        eyebrow={membership?.position_label ?? positionName ?? "Player"}
        title={fullName(player.first_name, player.last_name)}
        description={[
          membership ? teamDisplayName(membership.teams) : player.team_name,
          player.height,
          (membership?.jersey_number ?? player.jersey_number)
            ? `#${membership?.jersey_number ?? player.jersey_number}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-1 size-4" /> Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDelete}>
              <Trash2 className="mr-1 size-4" /> Delete
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Games" value={String(playerGames.length)} />
        <StatCard label="Teams" value={String(memberships.length)} />
        <StatCard
          label="Clips"
          value={String(playerGames.reduce((total, game) => total + game.clip_count, 0))}
        />
        <StatCard label="References" value={String(references.length)} hint="Photos and videos" />
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
          <TabsTrigger value="references">Reference Library</TabsTrigger>
          <TabsTrigger value="games">Games</TabsTrigger>
          <TabsTrigger value="development">Development</TabsTrigger>
          <TabsTrigger value="film">Film</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <SectionCard title="Profile">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid size-14 place-items-center rounded-full bg-surface-2 font-display text-lg font-semibold">
                {initials(player.first_name, player.last_name)}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {membership?.position_label ?? positionName ? (
                  <Tag>{membership?.position_label ?? positionName}</Tag>
                ) : null}
                {player.dominant_hand ? <Tag>{player.dominant_hand} dominant</Tag> : null}
                {player.graduation_year ? <Tag>Class of {player.graduation_year}</Tag> : null}
                {player.height ? <Tag>{player.height}</Tag> : null}
                {player.weight ? <Tag>{player.weight}</Tag> : null}
                {player.birthday ? <Tag>Born {player.birthday}</Tag> : null}
              </div>
            </div>
            {player.notes ? (
              <p className="mt-4 text-sm text-muted-foreground">{player.notes}</p>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No development notes yet.</p>
            )}
          </SectionCard>
          <IdentityScoreCard score={identityScore} />
          <AiReadinessPlaceholders />
        </TabsContent>

        <TabsContent value="teams" className="mt-4">
          <PlayerTeamsTab playerId={playerId} sportId={player.sport_id} />
        </TabsContent>

        <TabsContent value="references" className="mt-4">
          <ReferenceLibrary playerId={playerId} />
        </TabsContent>

        <TabsContent value="games" className="mt-4">
          <SectionCard title="Games" description="Film linked to this player">
            {playerGames.length === 0 ? (
              <EmptyState
                title="No games linked yet"
                description="Link this player when you create a game to build their film history."
                action={
                  <Button asChild>
                    <Link to="/games" search={{ add: true }}>
                      Analyze a game
                    </Link>
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {playerGames.map((game) => (
                  <GameCard key={game.id} game={game} />
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="development" className="mt-4 space-y-4">
          <SectionCard title="Development" description="Skill trends build up as evaluations land.">
            <EmptyState
              title="No development data yet"
              description="Evaluations from reviewed film will populate this view."
              action={
                <Button variant="outline" asChild>
                  <Link to="/development">Open development</Link>
                </Button>
              }
            />
          </SectionCard>
        </TabsContent>

        <TabsContent value="film" className="mt-4">
          <SectionCard title="Film" description="Clips and playlists featuring this athlete.">
            <EmptyState
              title="No clips yet"
              description="Mark plays inside a game to build this athlete's film library."
              action={
                <Button variant="outline" asChild>
                  <Link to="/film-room">Open film room</Link>
                </Button>
              }
            />
          </SectionCard>
        </TabsContent>
      </Tabs>

      <PlayerFormDialog open={editOpen} onOpenChange={setEditOpen} player={player} />
    </AppShell>
  );
}
