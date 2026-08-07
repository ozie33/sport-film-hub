import { createFileRoute } from "@tanstack/react-router";
import { Film, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { DemoNotice } from "@/components/common/demo-badge";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { GameCard } from "@/components/games/game-card";
import { GameFormDialog } from "@/components/games/game-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { WORKFLOW_STATUS_LABELS, type WorkflowStatus } from "@/lib/domain";
import { useGames, useProfile } from "@/lib/data/queries";
import { demoGames } from "@/lib/demo/demo-data";

export const Route = createFileRoute("/_authenticated/games")({
  validateSearch: (search: Record<string, unknown>): { add?: boolean | undefined } => ({
    add: search['add'] === true || search['add'] === "true" ? true : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Games — CourtBase" },
      { name: "description", content: "Every game in your film library with upload and analysis status." },
      { property: "og:title", content: "Games — CourtBase" },
      { property: "og:description", content: "Every game in your film library with analysis status." },
    ],
  }),
  component: GamesPage,
});

const STATUS_FILTERS: (WorkflowStatus | "all")[] = [
  "all",
  "upload_pending",
  "uploaded",
  "processing",
  "ready_for_review",
  "reviewed",
];

function GamesPage() {
  const { add } = Route.useSearch();
  const { data: profile } = useProfile();
  const { data: games = [], isLoading } = useGames();
  const [dialogOpen, setDialogOpen] = useState(Boolean(add));
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<WorkflowStatus | "all">("all");

  const demoMode = profile?.demo_mode ?? false;
  const usingDemo = demoMode && games.length === 0;
  const source = usingDemo ? demoGames : games;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return source.filter((game) => {
      const matchesStatus = status === "all" || game.video_status === status;
      if (!matchesStatus) return false;
      if (!needle) return true;
      const names = (game.game_players ?? [])
        .map((link) => `${link.players?.first_name ?? ""} ${link.players?.last_name ?? ""}`)
        .join(" ");
      return `${game.title} ${game.opponent ?? ""} ${names}`.toLowerCase().includes(needle);
    });
  }, [source, query, status]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Games"
        title="Games"
        description="Every game you've added, with its upload and analysis state."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1 size-4" /> Analyze New Game
          </Button>
        }
      />

      {usingDemo ? <DemoNotice>Sample games shown while your library is empty.</DemoNotice> : null}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
        <Input
          placeholder="Search by game, opponent or player"
          value={query}
          onChange={(inputEvent) => setQuery(inputEvent.target.value)}
        />
        <Select value={status} onValueChange={(value) => setStatus(value as WorkflowStatus | "all")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((value) => (
              <SelectItem key={value} value={value}>
                {value === "all" ? "All statuses" : WORKFLOW_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-48 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Film className="size-8" />}
          title={source.length === 0 ? "No games yet" : "No games match your filters"}
          description={
            source.length === 0
              ? "Create your first game record to start building the film library."
              : "Try a different search term or status filter."
          }
          action={
            source.length === 0 ? (
              <Button onClick={() => setDialogOpen(true)}>Analyze Your First Game</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((game) => (
            <GameCard key={game.id} game={game} isDemo={usingDemo} />
          ))}
        </div>
      )}

      <GameFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </AppShell>
  );
}
