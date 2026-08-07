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
import { useProfile, useSports } from "@/lib/data/queries";
import { useSaveTeam, type TeamRecord } from "@/lib/data/identity-queries";
import { TEAM_LEVELS } from "@/lib/identity/identity";

export function TeamFormDialog({
  open,
  onOpenChange,
  team,
  defaultSportId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team?: TeamRecord | null;
  defaultSportId?: string | null;
  onSaved?: (teamId: string) => void;
}) {
  const { data: profile } = useProfile();
  const { data: sports = [] } = useSports();
  const saveTeam = useSaveTeam();

  const [organization, setOrganization] = useState("");
  const [teamName, setTeamName] = useState("");
  const [sportId, setSportId] = useState("");
  const [season, setSeason] = useState("");
  const [level, setLevel] = useState("");
  const [coach, setCoach] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#f97316");
  const [secondaryColor, setSecondaryColor] = useState("#111827");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setOrganization(team?.organization_name ?? "");
    setTeamName(team?.team_name ?? "");
    setSportId(team?.sport_id ?? defaultSportId ?? profile?.primary_sport_id ?? sports[0]?.id ?? "");
    setSeason(team?.season ?? "");
    setLevel(team?.level ?? "");
    setCoach(team?.coach_name ?? "");
    setPrimaryColor(team?.primary_color ?? "#f97316");
    setSecondaryColor(team?.secondary_color ?? "#111827");
    setNotes(team?.notes ?? "");
  }, [open, team, defaultSportId, profile, sports]);

  async function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    try {
      const teamId = await saveTeam.mutateAsync({
        id: team?.id,
        values: {
          organization_name: organization.trim() || null,
          team_name: teamName.trim(),
          sport_id: sportId || null,
          season: season.trim() || null,
          level: level || null,
          coach_name: coach.trim() || null,
          primary_color: primaryColor || null,
          secondary_color: secondaryColor || null,
          notes: notes.trim() || null,
        },
      });
      toast.success(team ? "Team updated" : "Team added");
      onSaved?.(teamId);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the team");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{team ? "Edit team" : "Add a team"}</DialogTitle>
          <DialogDescription>
            Teams are shared across players — one athlete can belong to several of them.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="team-name">Team name</Label>
              <Input
                id="team-name"
                required
                placeholder="East High School Varsity"
                value={teamName}
                onChange={(inputEvent) => setTeamName(inputEvent.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-org">Organization</Label>
              <Input
                id="team-org"
                placeholder="East High School"
                value={organization}
                onChange={(inputEvent) => setOrganization(inputEvent.target.value)}
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
              <Label htmlFor="team-season">Season</Label>
              <Input
                id="team-season"
                placeholder="2025-26"
                value={season}
                onChange={(inputEvent) => setSeason(inputEvent.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Level</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {TEAM_LEVELS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="team-coach">Coach</Label>
              <Input
                id="team-coach"
                value={coach}
                onChange={(inputEvent) => setCoach(inputEvent.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-primary">Primary color</Label>
              <Input
                id="team-primary"
                type="color"
                className="h-10 p-1"
                value={primaryColor}
                onChange={(inputEvent) => setPrimaryColor(inputEvent.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-secondary">Secondary color</Label>
              <Input
                id="team-secondary"
                type="color"
                className="h-10 p-1"
                value={secondaryColor}
                onChange={(inputEvent) => setSecondaryColor(inputEvent.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="team-notes">Notes</Label>
              <Textarea
                id="team-notes"
                rows={2}
                value={notes}
                onChange={(inputEvent) => setNotes(inputEvent.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveTeam.isPending}>
              {team ? "Save changes" : "Add team"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}