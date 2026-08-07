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
import { Switch } from "@/components/ui/switch";
import { TeamFormDialog } from "@/components/teams/team-form-dialog";
import { useSportPositions } from "@/lib/data/queries";
import {
  teamDisplayName,
  useSaveMembership,
  useTeams,
  type MembershipRecord,
} from "@/lib/data/identity-queries";

export function MembershipDialog({
  open,
  onOpenChange,
  playerId,
  sportId,
  membership,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerId: string;
  sportId: string | null;
  membership?: MembershipRecord | null;
}) {
  const { data: teams = [] } = useTeams();
  const { data: positions = [] } = useSportPositions(sportId);
  const saveMembership = useSaveMembership();

  const [teamId, setTeamId] = useState("");
  const [jersey, setJersey] = useState("");
  const [positionId, setPositionId] = useState("");
  const [season, setSeason] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [active, setActive] = useState(true);
  const [isCurrent, setIsCurrent] = useState(false);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTeamId(membership?.team_id ?? "");
    setJersey(membership?.jersey_number ?? "");
    setPositionId(membership?.position_id ?? "");
    setSeason(membership?.season ?? "");
    setStartDate(membership?.start_date ?? "");
    setEndDate(membership?.end_date ?? "");
    setActive(membership?.active ?? true);
    setIsCurrent(membership?.is_current ?? false);
  }, [open, membership]);

  async function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!teamId) {
      toast.error("Select a team");
      return;
    }
    const positionLabel = positions.find((position) => position.id === positionId)?.name ?? null;
    try {
      await saveMembership.mutateAsync({
        id: membership?.id,
        values: {
          player_id: playerId,
          team_id: teamId,
          jersey_number: jersey.trim() || null,
          position_id: positionId || null,
          position_label: positionLabel,
          season: season.trim() || null,
          start_date: startDate || null,
          end_date: endDate || null,
          active,
          is_current: isCurrent,
        },
      });
      toast.success(membership ? "Membership updated" : "Team added to player");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the membership");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{membership ? "Edit team membership" : "Add team membership"}</DialogTitle>
          <DialogDescription>
            One athlete, many teams — jersey numbers and positions live on the membership.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>Team</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => setTeamDialogOpen(true)}>
                New team
              </Button>
            </div>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger>
                <SelectValue placeholder={teams.length ? "Select a team" : "No teams yet"} />
              </SelectTrigger>
              <SelectContent>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {teamDisplayName(team)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="membership-jersey">Jersey number</Label>
              <Input
                id="membership-jersey"
                value={jersey}
                onChange={(inputEvent) => setJersey(inputEvent.target.value)}
              />
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
              <Label htmlFor="membership-season">Season</Label>
              <Input
                id="membership-season"
                placeholder="2025-26"
                value={season}
                onChange={(inputEvent) => setSeason(inputEvent.target.value)}
              />
            </div>
            <div className="space-y-1.5" />
            <div className="space-y-1.5">
              <Label htmlFor="membership-start">Start date</Label>
              <Input
                id="membership-start"
                type="date"
                value={startDate}
                onChange={(inputEvent) => setStartDate(inputEvent.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="membership-end">End date</Label>
              <Input
                id="membership-end"
                type="date"
                value={endDate}
                onChange={(inputEvent) => setEndDate(inputEvent.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-6 rounded-lg border border-border bg-surface/60 p-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={active} onCheckedChange={setActive} />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={isCurrent} onCheckedChange={setIsCurrent} />
              Current team
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMembership.isPending}>
              {membership ? "Save changes" : "Add membership"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      <TeamFormDialog
        open={teamDialogOpen}
        onOpenChange={setTeamDialogOpen}
        defaultSportId={sportId}
        onSaved={(newTeamId) => setTeamId(newTeamId)}
      />
    </Dialog>
  );
}