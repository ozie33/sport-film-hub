import { createFileRoute, Link } from "@tanstack/react-router";
import { Film, Plus } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { ClipCard } from "@/components/common/clip-card";
import { DemoNotice } from "@/components/common/demo-badge";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { SharedWithMe } from "@/components/sharing/shared-with-me";
import { SectionCard, StatCard } from "@/components/common/stat-card";
import { GameCard } from "@/components/games/game-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useGames, useProfile } from "@/lib/data/queries";
import { demoClips, demoGames, demoSnapshot } from "@/lib/demo/demo-data";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — CourtBase" },
      { name: "description", content: "Your recent games, development snapshot and latest player clips." },
      { property: "og:title", content: "Dashboard — CourtBase" },
      { property: "og:description", content: "Recent games, development snapshot and latest clips." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: profile } = useProfile();
  const { data: games = [], isLoading } = useGames();
  const demoMode = profile?.demo_mode ?? false;

  const visibleGames = demoMode && games.length === 0 ? demoGames : games;
  const visibleClips = demoMode ? demoClips : [];

  return (
    <AppShell>
      <PageHeader
        eyebrow="Dashboard"
        title={`Welcome back, ${profile?.first_name || "Coach"}`}
        description="Your film library, development signals and latest clips in one place."
        actions={
          <Button asChild>
            <Link to="/games" search={{ add: true }}>
              <Plus className="mr-1 size-4" /> Analyze New Game
            </Link>
          </Button>
        }
      />

      <SharedWithMe compact />

      <SectionCard
        title="Recent Games"
        description="Newest film first"
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link to="/games">View all</Link>
          </Button>
        }
      >
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-40 w-full" />
            ))}
          </div>
        ) : visibleGames.length === 0 ? (
          <EmptyState
            icon={<Film className="size-8" />}
            title="Your Film Room is empty."
            description="Upload your first game to begin building your player-development library."
            action={
              <Button asChild>
                <Link to="/games" search={{ add: true }}>
                  Analyze Your First Game
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleGames.slice(0, 6).map((game) => (
              <GameCard key={game.id} game={game} isDemo={demoMode && games.length === 0} />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Player Development Snapshot"
        description="Development metrics become available after game analysis."
      >
        {demoMode ? (
          <div className="space-y-4">
            <DemoNotice />
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {demoSnapshot.map((stat) => (
                <StatCard key={stat.label} label={stat.label} value={stat.value} />
              ))}
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {demoSnapshot.map((stat) => (
              <StatCard key={stat.label} label={stat.label} value="—" hint="Awaiting analysis" />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Recent Player Clips" description="Latest generated clips across your players">
        {visibleClips.length === 0 ? (
          <EmptyState
            title="No clips yet"
            description="Clips are generated once a game has been uploaded and analyzed."
          />
        ) : (
          <div className="space-y-4">
            <DemoNotice>These sample clips preview how your clip library will look.</DemoNotice>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleClips.map((clip) => (
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
          </div>
        )}
      </SectionCard>
    </AppShell>
  );
}
