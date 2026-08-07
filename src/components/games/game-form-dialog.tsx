import { useEffect, useState } from "react";
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
import { useCreateGame, usePlayers, useProfile, useSports } from "@/lib/data/queries";
import { fullName } from "@/lib/format";

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

  async function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!sportId) {
      toast.error("Select a sport");
      return;
    }
    try {
      await createGame.mutateAsync({
        sport_id: sportId,
        title: title.trim(),
        opponent: opponent.trim() || null,
        game_date: gameDate || null,
        is_home: isHome === "home",
        notes: notes.trim() || null,
        player_ids: playerId ? [playerId] : [],
      });
      toast.success("Game created. Video upload arrives in the next phase.");
      onOpenChange(false);
      setTitle("");
      setOpponent("");
      setGameDate("");
      setPlayerId("");
      setNotes("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the game");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Analyze a new game</DialogTitle>
          <DialogDescription>
            Create the game record now. Video upload and AI analysis arrive in a later phase.
          </DialogDescription>
        </DialogHeader>
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
              Create game
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
