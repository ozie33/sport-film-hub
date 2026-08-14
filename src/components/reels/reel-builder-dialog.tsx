import { useState } from "react";
import { Film } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { REEL_MODES } from "@/lib/ai/review-ai";
import { useBuildReel } from "@/lib/data/ai-queries";
import { useGames, usePlayers } from "@/lib/data/queries";
import { fullName } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Reel sequencing is AI-assisted but human-owned: the AI proposes an order from
 * the marked plays and the user edits it afterwards.
 */
export function ReelBuilderDialog({ onCreated }: { onCreated?: (reelId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<string>("best_plays");
  const [playerId, setPlayerId] = useState<string>("");
  const [gameIds, setGameIds] = useState<string[]>([]);
  const [maxClips, setMaxClips] = useState(12);
  const [customPrompt, setCustomPrompt] = useState("");

  const { data: players = [] } = usePlayers();
  const { data: games = [] } = useGames();
  const build = useBuildReel();

  function toggleGame(id: string) {
    setGameIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  function submit() {
    build.mutate(
      {
        mode,
        playerId: playerId || null,
        gameIds,
        customPrompt: customPrompt || null,
        maxClips,
      },
      {
        onSuccess: (result) => {
          toast.success(`AI sequenced ${result.clipCount} of your ${result.reviewedClipCount} reviewed plays`);
          setOpen(false);
          onCreated?.(result.reelId);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Film className="size-4" /> Build Reel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Build a reel</DialogTitle>
          <DialogDescription>
            The AI sequences plays you already marked. It reads your tags, notes and ratings — it
            does not watch the video.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <Label className="label-caps text-[10px] text-muted-foreground">Reel type</Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {REEL_MODES.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setMode(option.key)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    mode === option.key
                      ? "border-primary bg-primary/10"
                      : "border-border bg-surface-2 hover:border-primary/40",
                  )}
                >
                  <span className="block font-medium">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">{option.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="reel-player">Athlete</Label>
              <select
                id="reel-player"
                value={playerId}
                onChange={(event) => setPlayerId(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All athletes</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {fullName(player.first_name, player.last_name)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="reel-max">Max plays</Label>
              <Input
                id="reel-max"
                type="number"
                min={3}
                max={40}
                value={maxClips}
                onChange={(event) => setMaxClips(Number(event.target.value) || 12)}
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label className="label-caps text-[10px] text-muted-foreground">
              Games (leave empty for every game)
            </Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {games.map((game) => (
                <Button
                  key={game.id}
                  type="button"
                  size="sm"
                  variant={gameIds.includes(game.id) ? "default" : "outline"}
                  onClick={() => toggleGame(game.id)}
                >
                  {game.title}
                </Button>
              ))}
            </div>
          </div>

          {mode === "custom" ? (
            <div>
              <Label htmlFor="reel-prompt">What should this reel show?</Label>
              <Textarea
                id="reel-prompt"
                value={customPrompt}
                onChange={(event) => setCustomPrompt(event.target.value)}
                placeholder="A 10-play reel for college coaches focused on pick-and-roll reads"
                className="mt-1.5"
              />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={build.isPending}>
            {build.isPending ? "Sequencing…" : "Build reel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}