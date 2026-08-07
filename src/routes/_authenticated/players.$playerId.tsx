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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeletePlayer, useGames, usePlayer, useSportPositions } from "@/lib/data/queries";
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
  const deletePlayer = useDeletePlayer();
  const [editOpen, setEditOpen] = useState(false);

  const playerGames = useMemo(
    () => games.filter((game) => (game.game_players ?? []).some((link) => link.player_id === playerId)),
    [games, playerId],
  );

  const positionName = positions.find((position) => position.id === player?.position_id)?.name;

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
        eyebrow={positionName ?? "Player"}
        title={fullName(player.first_name, player.last_name)}
        description={[player.team_name, player.height, player.jersey_number ? `#${player.jersey_number}` : null]
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
        <StatCard
          label="Clips"
          value={String(playerGames.reduce((total, game) => total + game.clip_count, 0))}
        />
        <StatCard label="Evaluations" value="—" hint="Awaiting analysis" />
        <StatCard label="Reels" value="—" hint="Coming soon" />
      </div>

      <SectionCard title="Profile">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-14 place-items-center rounded-full bg-surface-2 font-display text-lg font-semibold">
            {initials(player.first_name, player.last_name)}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {positionName ? <Tag>{positionName}</Tag> : null}
            {player.dominant_hand ? <Tag>{player.dominant_hand} dominant</Tag> : null}
            {player.graduation_year ? <Tag>Class of {player.graduation_year}</Tag> : null}
          </div>
        </div>
        {player.notes ? (
          <p className="mt-4 text-sm text-muted-foreground">{player.notes}</p>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No development notes yet.</p>
        )}
      </SectionCard>

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

      <PlayerFormDialog open={editOpen} onOpenChange={setEditOpen} player={player} />
    </AppShell>
  );
}
