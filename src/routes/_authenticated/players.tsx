import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { DemoNotice } from "@/components/common/demo-badge";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Tag } from "@/components/common/status-badge";
import { PlayerFormDialog } from "@/components/players/player-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlayers, useProfile } from "@/lib/data/queries";
import { demoPlayers } from "@/lib/demo/demo-data";
import { fullName, initials } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/players")({
  head: () => ({
    meta: [
      { title: "Players — CourtBase" },
      { name: "description", content: "Manage the athletes you track, their positions and development notes." },
      { property: "og:title", content: "Players — CourtBase" },
      { property: "og:description", content: "Athletes you track, with positions and development notes." },
    ],
  }),
  component: PlayersPage,
});

function PlayersPage() {
  const { data: profile } = useProfile();
  const { data: players = [], isLoading } = usePlayers();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [query, setQuery] = useState("");

  const usingDemo = (profile?.demo_mode ?? false) && players.length === 0;
  const source = usingDemo ? demoPlayers : players;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return source;
    return source.filter((player) =>
      `${player.first_name} ${player.last_name} ${player.team_name ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }, [source, query]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Players"
        title="Players"
        description="Every athlete you track. Positions and metrics adapt to each sport."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1 size-4" /> Add Player
          </Button>
        }
      />

      {usingDemo ? <DemoNotice>Sample players shown while your roster is empty.</DemoNotice> : null}

      <Input
        placeholder="Search players or teams"
        value={query}
        onChange={(inputEvent) => setQuery(inputEvent.target.value)}
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-36 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="size-8" />}
          title={source.length === 0 ? "No players yet" : "No players match your search"}
          description={
            source.length === 0
              ? "Add the athlete you're developing to start linking film and evaluations."
              : "Try a different name or team."
          }
          action={
            source.length === 0 ? (
              <Button onClick={() => setDialogOpen(true)}>Add Your First Player</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((player) => (
            <article key={player.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 font-display text-sm font-semibold">
                  {initials(player.first_name, player.last_name)}
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold uppercase">
                    {fullName(player.first_name, player.last_name)}
                  </h3>
                  <p className="truncate text-xs text-muted-foreground">
                    {player.team_name || "No team"}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {player.jersey_number ? <Tag>#{player.jersey_number}</Tag> : null}
                {player.height ? <Tag>{player.height}</Tag> : null}
                {player.graduation_year ? <Tag>Class of {player.graduation_year}</Tag> : null}
              </div>
              <div className="mt-4">
                {usingDemo ? (
                  <Button variant="outline" size="sm" className="w-full" disabled>
                    View Profile
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <Link to="/players/$playerId" params={{ playerId: player.id }}>
                      View Profile
                    </Link>
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <PlayerFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </AppShell>
  );
}
