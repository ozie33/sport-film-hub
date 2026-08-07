import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge, Tag } from "@/components/common/status-badge";
import { SectionCard, StatCard } from "@/components/common/stat-card";
import { VideoPlaceholder } from "@/components/common/video-placeholder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { PLAY_SIDE_LABELS } from "@/lib/domain";
import {
  useCreateEvent,
  useDeleteEvent,
  useEventTypes,
  useGame,
  useGameEvents,
} from "@/lib/data/queries";
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
  const createEvent = useCreateEvent();
  const deleteEvent = useDeleteEvent(gameId);

  const [typeKey, setTypeKey] = useState("");
  const [subtype, setSubtype] = useState("");
  const [outcome, setOutcome] = useState("");
  const [clock, setClock] = useState("");
  const [notes, setNotes] = useState("");

  const selectedType = eventTypes.find((type) => type.key === typeKey);
  const primaryPlayer = game?.game_players?.find((link) => link.is_primary) ?? game?.game_players?.[0];

  const summary = useMemo(() => {
    const offense = events.filter((item) => item.offense_or_defense === "offense").length;
    const defense = events.filter((item) => item.offense_or_defense === "defense").length;
    return [
      { label: "Tagged events", value: String(events.length) },
      { label: "Offense", value: String(offense) },
      { label: "Defense", value: String(defense) },
      { label: "Clips", value: String(game?.clip_count ?? 0) },
    ];
  }, [events, game]);

  function parseClock(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.includes(":")) {
      const [minutes, seconds] = trimmed.split(":");
      const total = Number(minutes) * 60 + Number(seconds);
      return Number.isFinite(total) ? total : null;
    }
    const asNumber = Number(trimmed);
    return Number.isFinite(asNumber) ? asNumber : null;
  }

  async function handleAddEvent(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    const startTime = parseClock(clock);
    if (!typeKey || startTime === null) {
      toast.error("Pick an event type and a valid timestamp (mm:ss)");
      return;
    }
    try {
      await createEvent.mutateAsync({
        game_id: gameId,
        player_id: primaryPlayer?.player_id ?? null,
        event_type_key: typeKey,
        event_subtype: subtype || null,
        outcome: outcome || null,
        offense_or_defense: selectedType?.default_side ?? "neutral",
        start_time: startTime,
        end_time: startTime + 8,
        notes: notes.trim() || null,
      });
      toast.success("Event tagged");
      setSubtype("");
      setOutcome("");
      setClock("");
      setNotes("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not tag the event");
    }
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
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summary.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <VideoPlaceholder
            title={game.title}
            subtitle="Video upload and AI analysis arrive in a later phase."
          />

          <SectionCard title="Event Timeline" description="Chronological tagged moments">
            {events.length === 0 ? (
              <EmptyState
                title="No events tagged yet"
                description="Tag key moments manually now; AI-generated events will merge into this same timeline."
              />
            ) : (
              <ol className="space-y-2">
                {events.map((item) => (
                  <li
                    key={item.id}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2"
                  >
                    <span className="label-caps rounded-md bg-background px-2 py-1 text-[11px] tabular-nums">
                      {formatClock(item.start_time)}
                    </span>
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
          <SectionCard title="Tag an Event" description="Manual entry until AI analysis is live">
            <form onSubmit={handleAddEvent} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Event type</Label>
                <Select
                  value={typeKey}
                  onValueChange={(value) => {
                    setTypeKey(value);
                    setSubtype("");
                    setOutcome("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an event type" />
                  </SelectTrigger>
                  <SelectContent>
                    {eventTypes.map((type) => (
                      <SelectItem key={type.id} value={type.key}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedType && selectedType.subtypes.length > 0 ? (
                <div className="space-y-1.5">
                  <Label>Subtype</Label>
                  <Select value={subtype} onValueChange={setSubtype}>
                    <SelectTrigger>
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedType.subtypes.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {selectedType && selectedType.outcomes.length > 0 ? (
                <div className="space-y-1.5">
                  <Label>Outcome</Label>
                  <Select value={outcome} onValueChange={setOutcome}>
                    <SelectTrigger>
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedType.outcomes.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="event-clock">Video timestamp (mm:ss)</Label>
                <Input
                  id="event-clock"
                  placeholder="02:14"
                  value={clock}
                  onChange={(inputEvent) => setClock(inputEvent.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="event-notes">Coaching note</Label>
                <Textarea
                  id="event-notes"
                  rows={3}
                  value={notes}
                  onChange={(inputEvent) => setNotes(inputEvent.target.value)}
                />
              </div>

              <Button type="submit" className="w-full" disabled={createEvent.isPending}>
                <Plus className="mr-1 size-4" /> Add event
              </Button>
            </form>
          </SectionCard>

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
