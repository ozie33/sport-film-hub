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
import { DOMINANT_HAND_OPTIONS } from "@/lib/domain";
import {
  useProfile,
  useSavePlayer,
  useSportPositions,
  useSports,
  type PlayerRecord,
} from "@/lib/data/queries";

export function PlayerFormDialog({
  open,
  onOpenChange,
  player,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player?: PlayerRecord | null;
}) {
  const { data: profile } = useProfile();
  const { data: sports = [] } = useSports();
  const savePlayer = useSavePlayer();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [sportId, setSportId] = useState("");
  const [positionId, setPositionId] = useState("");
  const [teamName, setTeamName] = useState("");
  const [jersey, setJersey] = useState("");
  const [height, setHeight] = useState("");
  const [gradYear, setGradYear] = useState("");
  const [hand, setHand] = useState("");
  const [notes, setNotes] = useState("");

  const { data: positions = [] } = useSportPositions(sportId || null);

  useEffect(() => {
    if (!open) return;
    setFirstName(player?.first_name ?? "");
    setLastName(player?.last_name ?? "");
    setSportId(player?.sport_id ?? profile?.primary_sport_id ?? sports[0]?.id ?? "");
    setPositionId(player?.position_id ?? "");
    setTeamName(player?.team_name ?? "");
    setJersey(player?.jersey_number ?? "");
    setHeight(player?.height ?? "");
    setGradYear(player?.graduation_year ? String(player.graduation_year) : "");
    setHand(player?.dominant_hand ?? "");
    setNotes(player?.notes ?? "");
  }, [open, player, profile, sports]);

  async function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!sportId) {
      toast.error("Select a sport");
      return;
    }
    try {
      await savePlayer.mutateAsync({
        id: player?.id,
        values: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          image_url: player?.image_url ?? null,
          sport_id: sportId,
          team_name: teamName.trim() || null,
          jersey_number: jersey.trim() || null,
          position_id: positionId || null,
          height: height.trim() || null,
          graduation_year: gradYear ? Number(gradYear) : null,
          dominant_hand: hand || null,
          notes: notes.trim() || null,
        },
      });
      toast.success(player ? "Player updated" : "Player added");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the player");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{player ? "Edit player" : "Add a player"}</DialogTitle>
          <DialogDescription>
            Players are sport-aware — positions come from the selected sport's catalog.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="player-first">First name</Label>
              <Input
                id="player-first"
                required
                value={firstName}
                onChange={(inputEvent) => setFirstName(inputEvent.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="player-last">Last name</Label>
              <Input
                id="player-last"
                required
                value={lastName}
                onChange={(inputEvent) => setLastName(inputEvent.target.value)}
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
              <Label>Position</Label>
              <Select value={positionId} onValueChange={setPositionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {positions.map((position) => (
                    <SelectItem key={position.id} value={position.id}>
                      {position.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="player-team">Team</Label>
              <Input
                id="player-team"
                value={teamName}
                onChange={(inputEvent) => setTeamName(inputEvent.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="player-jersey">Jersey number</Label>
              <Input
                id="player-jersey"
                value={jersey}
                onChange={(inputEvent) => setJersey(inputEvent.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="player-height">Height</Label>
              <Input
                id="player-height"
                placeholder="6'2&quot;"
                value={height}
                onChange={(inputEvent) => setHeight(inputEvent.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="player-grad">Graduation year</Label>
              <Input
                id="player-grad"
                inputMode="numeric"
                value={gradYear}
                onChange={(inputEvent) => setGradYear(inputEvent.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Dominant hand or side</Label>
              <Select value={hand} onValueChange={setHand}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {DOMINANT_HAND_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="player-notes">Development notes</Label>
              <Textarea
                id="player-notes"
                rows={3}
                value={notes}
                onChange={(inputEvent) => setNotes(inputEvent.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={savePlayer.isPending}>
              {player ? "Save changes" : "Add player"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
