import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { AddFilmPanel } from "@/components/video/add-film-panel";
import { useVideoAssets } from "@/lib/data/video-queries";
import { useCreateGame, usePlayers, useProfile, useSports } from "@/lib/data/queries";
import { fullName } from "@/lib/format";
import { cn } from "@/lib/utils";

export function GameFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: profile } = useProfile();
  const { data: sports = [] } = useSports();
  const { data: players = [] } = usePlayers();
  const createGame = useCreateGame();
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2>(1);
  const [createdGameId, setCreatedGameId] = useState<string | null>(null);
  const { data: assets = [] } = useVideoAssets(createdGameId ?? undefined);

  const [title, setTitle] = useState("");
  const [opponent, setOpponent] = useState("");
  const [gameDate, setGameDate] = useState("");
  const [sportId, setSportId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [isHome, setIsHome] = useState("home");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setSportId(profile?.primary_sport_id ?? sports[0]?.id ?? "");
  }, [open, profile, sports]);

  function resetAll() {
    setStep(1);
    setCreatedGameId(null);
    setTitle("");
    setOpponent("");
    setGameDate("");
    setPlayerId("");
    setNotes("");
  }

  async function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!sportId) {
      toast.error("Select a sport");
      return;
    }
    try {
      const gameId = await createGame.mutateAsync({
        sport_id: sportId,
        title: title.trim(),
        opponent: opponent.trim() || null,
        game_date: gameDate || null,
        is_home: isHome === "home",
        notes: notes.trim() || null,
        player_ids: playerId ? [playerId] : [],
      });
      toast.success("Game created. Now attach the film.");
      setCreatedGameId(gameId);
      setStep(2);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the game");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) resetAll();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{step === 1 ? "Analyze a new game" : "Add film"}</DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Step 1 of 2 — game details."
              : "Step 2 of 2 — attach film from an upload, YouTube or Hudl. You can also do this later."}
          </DialogDescription>
          <StepIndicator step={step} />
        </DialogHeader>
        {step === 2 && createdGameId ? (
          <div className="space-y-4">
            <AddFilmPanel gameId={createdGameId} makePrimary={assets.length === 0} />
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  onOpenChange(false);
                  resetAll();
                }}
              >
                {assets.length > 0 ? "Done" : "Skip for now"}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  const gameId = createdGameId;
                  onOpenChange(false);
                  resetAll();
                  void navigate({ to: "/games/$gameId", params: { gameId } });
                }}
              >
                Open film room
                <ArrowRight className="size-4" />
              </Button>
            </DialogFooter>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="game-title">Game title</Label>
            <Input
              id="game-title"
              required
              placeholder="Northside vs Eastview"
              value={title}
              onChange={(inputEvent) => setTitle(inputEvent.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="game-opponent">Opponent</Label>
              <Input
                id="game-opponent"
                value={opponent}
                onChange={(inputEvent) => setOpponent(inputEvent.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="game-date">Date</Label>
              <Input
                id="game-date"
                type="date"
                value={gameDate}
                onChange={(inputEvent) => setGameDate(inputEvent.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sport</Label>
              <Select value={sportId} onValueChange={setSportId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a sport" />
                </SelectTrigger>
                <SelectContent>
                  {sports.map((sport) => (
                    <SelectItem key={sport.id} value={sport.id}>
                      {sport.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Home or away</Label>
              <Select value={isHome} onValueChange={setIsHome}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="home">Home</SelectItem>
                  <SelectItem value="away">Away</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Primary player</Label>
            {players.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No players yet — add one from the Players page to link film to an athlete.
              </p>
            ) : (
              <Select value={playerId} onValueChange={setPlayerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a player" />
                </SelectTrigger>
                <SelectContent>
                  {players.map((player) => (
                    <SelectItem key={player.id} value={player.id}>
                      {fullName(player.first_name, player.last_name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="game-notes">Notes</Label>
            <Textarea
              id="game-notes"
              rows={3}
              value={notes}
              onChange={(inputEvent) => setNotes(inputEvent.target.value)}
              placeholder="What should the analysis focus on?"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createGame.isPending}>
              Continue to film
              <ArrowRight className="size-4" />
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StepIndicator({ step }: { step: 1 | 2 }) {
  return (
    <ol className="flex items-center gap-2 pt-2">
      {[1, 2].map((value) => (
        <li key={value} className="flex flex-1 items-center gap-2">
          <span
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold",
              step >= value
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            {step > value ? <Check className="size-3" /> : value}
          </span>
          <span className="label-caps text-[10px] text-muted-foreground">
            {value === 1 ? "Game details" : "Add film"}
          </span>
          {value === 1 ? <span className="h-px flex-1 bg-border" /> : null}
        </li>
      ))}
    </ol>
  );
}
