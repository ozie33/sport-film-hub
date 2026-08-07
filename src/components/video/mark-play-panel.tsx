import { useEffect, useRef, useState } from "react";
import { Check, Flag, Keyboard, RotateCcw } from "lucide-react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import { useMarkPlay } from "@/lib/data/video-queries";
import type { EventTypeRecord } from "@/lib/domain";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FilmPlayerHandle } from "@/components/video/film-player-types";

const NONE = "__none__";

/**
 * The Mark Play workflow: set an In point, an Out point, label it, save.
 * A saved play is an event + a timestamp-range clip against the same source —
 * no video is cut or re-encoded, so it works for linked film too.
 */
export function MarkPlayPanel({
  gameId,
  sportId,
  videoAssetId,
  eventTypes,
  players,
  playerRef,
  canSeek,
  currentTime,
}: {
  gameId: string;
  sportId: string;
  videoAssetId: string | null;
  eventTypes: EventTypeRecord[];
  players: { player_id: string; name: string }[];
  playerRef: React.RefObject<FilmPlayerHandle | null>;
  canSeek: boolean;
  currentTime: number;
}) {
  const markPlay = useMarkPlay();
  const formRef = useRef<HTMLFormElement | null>(null);

  const [inPoint, setInPoint] = useState<number | null>(null);
  const [outPoint, setOutPoint] = useState<number | null>(null);
  const [manualIn, setManualIn] = useState("");
  const [typeKey, setTypeKey] = useState("");
  const [subtype, setSubtype] = useState(NONE);
  const [outcome, setOutcome] = useState(NONE);
  const [playerId, setPlayerId] = useState(players[0]?.player_id ?? NONE);
  const [notes, setNotes] = useState("");

  const selectedType = eventTypes.find((type) => type.key === typeKey);
  const disabled = !videoAssetId;

  function readClock(): number {
    if (canSeek && playerRef.current?.isReady()) return playerRef.current.getCurrentTime();
    return currentTime;
  }

  function markIn() {
    if (disabled) return;
    const value = readClock();
    setInPoint(value);
    if (outPoint !== null && outPoint <= value) setOutPoint(null);
  }

  function markOut() {
    if (disabled) return;
    const value = readClock();
    if (inPoint === null) {
      toast.error("Set the In point first (I).");
      return;
    }
    if (value <= inPoint) {
      toast.error("The Out point has to come after the In point.");
      return;
    }
    setOutPoint(value);
  }

  async function save() {
    if (disabled) {
      toast.error("Attach film to this game first.");
      return;
    }
    if (inPoint === null) {
      toast.error("Set an In point.");
      return;
    }
    if (!typeKey) {
      toast.error("Pick what happened on this play.");
      return;
    }
    const end = outPoint ?? inPoint + 8;
    try {
      await markPlay.mutateAsync({
        game_id: gameId,
        sport_id: sportId,
        video_asset_id: videoAssetId!,
        player_id: playerId === NONE ? null : playerId,
        event_type_key: typeKey,
        event_type_name: selectedType?.name ?? typeKey,
        event_subtype: subtype === NONE ? null : subtype,
        outcome: outcome === NONE ? null : outcome,
        offense_or_defense: selectedType?.default_side ?? "neutral",
        start_time: Math.max(0, Math.round(inPoint * 100) / 100),
        end_time: Math.round(end * 100) / 100,
        tags: [],
        notes: notes.trim() || null,
      });
      toast.success("Play marked and added to your clips.");
      setInPoint(null);
      setOutPoint(null);
      setNotes("");
      setSubtype(NONE);
      setOutcome(NONE);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the play");
    }
  }

  // Keyboard shortcuts: I = in, O = out, Enter = save, Space = play/pause.
  useEffect(() => {
    function onKeyDown(keyEvent: KeyboardEvent) {
      const target = keyEvent.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;
      if (typing && keyEvent.key !== "Enter") return;

      const key = keyEvent.key.toLowerCase();
      if (key === "i") {
        keyEvent.preventDefault();
        markIn();
      } else if (key === "o") {
        keyEvent.preventDefault();
        markOut();
      } else if (keyEvent.key === "Enter" && (inPoint !== null || typing === false)) {
        if (typing && target?.tagName === "TEXTAREA") return;
        keyEvent.preventDefault();
        void save();
      } else if (keyEvent.key === " " && !typing && canSeek) {
        keyEvent.preventDefault();
        playerRef.current?.togglePlay();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inPoint, outPoint, typeKey, subtype, outcome, playerId, notes, videoAssetId, canSeek, currentTime]);

  return (
    <form
      ref={formRef}
      onSubmit={(formEvent) => {
        formEvent.preventDefault();
        void save();
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-2">
        <MarkButton
          label="Mark In"
          shortcut="I"
          value={inPoint}
          onClick={markIn}
          disabled={disabled}
        />
        <MarkButton
          label="Mark Out"
          shortcut="O"
          value={outPoint}
          onClick={markOut}
          disabled={disabled}
        />
      </div>

      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
        <span className="text-muted-foreground">
          Clip length{" "}
          <strong className="tabular-nums text-foreground">
            {inPoint !== null && outPoint !== null ? `${Math.round(outPoint - inPoint)}s` : "—"}
          </strong>
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setInPoint(null);
            setOutPoint(null);
          }}
        >
          <RotateCcw className="size-3" /> Reset points
        </button>
      </div>

      {!canSeek ? (
        <div className="space-y-1.5">
          <Label htmlFor="manual-in">In point (mm:ss)</Label>
          <Input
            id="manual-in"
            placeholder="02:14"
            value={manualIn}
            onChange={(inputEvent) => {
              setManualIn(inputEvent.target.value);
              const parsed = parseClock(inputEvent.target.value);
              setInPoint(parsed);
              if (parsed !== null) setOutPoint(parsed + 8);
            }}
          />
          <p className="text-xs text-muted-foreground">
            This source plays with its provider, so type the timestamp you saw there.
          </p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label>What happened</Label>
        <Select
          value={typeKey}
          onValueChange={(value) => {
            setTypeKey(value);
            setSubtype(NONE);
            setOutcome(NONE);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a play type" />
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
          <Label>Detail</Label>
          <Select value={subtype} onValueChange={setSubtype}>
            <SelectTrigger>
              <SelectValue placeholder="Optional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
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
              <SelectItem value={NONE}>None</SelectItem>
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
        <Label>Player</Label>
        <Select value={playerId} onValueChange={setPlayerId}>
          <SelectTrigger>
            <SelectValue placeholder="Unassigned" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Unassigned</SelectItem>
            {players.map((player) => (
              <SelectItem key={player.player_id} value={player.player_id}>
                {player.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="play-notes">Coaching note</Label>
        <Textarea
          id="play-notes"
          rows={2}
          value={notes}
          onChange={(inputEvent) => setNotes(inputEvent.target.value)}
        />
      </div>

      <Button type="submit" className="w-full" disabled={markPlay.isPending || disabled}>
        <Check className="size-4" /> Save play
      </Button>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Keyboard className="size-3.5" />
        <span>
          <kbd className="rounded border border-border px-1">I</kbd> in ·{" "}
          <kbd className="rounded border border-border px-1">O</kbd> out ·{" "}
          <kbd className="rounded border border-border px-1">Enter</kbd> save
          {canSeek ? (
            <>
              {" "}
              · <kbd className="rounded border border-border px-1">Space</kbd> play
            </>
          ) : null}
        </span>
      </p>
    </form>
  );
}

function MarkButton({
  label,
  shortcut,
  value,
  onClick,
  disabled,
}: {
  label: string;
  shortcut: string;
  value: number | null;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-50",
        value !== null
          ? "border-primary/50 bg-primary/10"
          : "border-border bg-card hover:border-primary/40",
      )}
    >
      <span className="label-caps flex w-full items-center justify-between text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Flag className="size-3" />
          {label}
        </span>
        <kbd className="rounded border border-border px-1">{shortcut}</kbd>
      </span>
      <span className="text-lg font-semibold tabular-nums">
        {value !== null ? formatClock(value) : "--:--"}
      </span>
    </button>
  );
}

export function parseClock(value: string): number | null {
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