import { Link } from "@tanstack/react-router";

import { DemoBadge } from "@/components/common/demo-badge";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import type { GameRecord } from "@/lib/data/queries";
import { formatGameDate, fullName } from "@/lib/format";

export function gamePlayerNames(game: GameRecord): string {
  const names = (game.game_players ?? [])
    .map((link) => fullName(link.players?.first_name, link.players?.last_name))
    .filter(Boolean);
  return names.length > 0 ? names.join(", ") : "No player linked";
}

export function GameCard({ game, isDemo = false }: { game: GameRecord; isDemo?: boolean }) {
  return (
    <article className="flex flex-col rounded-xl border border-border bg-card p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <div className="min-w-0">
          <p className="label-caps text-[11px] text-muted-foreground">
            vs {game.opponent || "Unknown opponent"}
          </p>
          <h3 className="truncate text-lg font-semibold uppercase">{game.title}</h3>
        </div>
        {isDemo ? <DemoBadge /> : null}
      </div>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Date</dt>
          <dd className="truncate">{formatGameDate(game.game_date)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Player</dt>
          <dd className="min-w-0 truncate">{gamePlayerNames(game)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Clips</dt>
          <dd className="tabular-nums">{game.clip_count}</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={game.analysis_status} />
      </div>
      <div className="mt-4">
        {isDemo ? (
          <Button variant="outline" size="sm" className="w-full" disabled>
            View Game
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="w-full" asChild>
            <Link to="/games/$gameId" params={{ gameId: game.id }}>
              View Game
            </Link>
          </Button>
        )}
      </div>
    </article>
  );
}
