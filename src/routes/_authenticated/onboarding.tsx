import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { ONBOARDING_ROLES, ROLE_LABELS, type AppRole } from "@/lib/domain";
import { useProfile, useSportPositions, useSports, useUpdateProfile } from "@/lib/data/queries";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your profile — CourtBase" },
      { name: "description", content: "Tell us your role, sport and position to set up CourtBase." },
      { property: "og:title", content: "Set up your profile — CourtBase" },
      { property: "og:description", content: "A short setup before you analyze your first game." },
    ],
  }),
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const { data: sports = [] } = useSports();
  const updateProfile = useUpdateProfile();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<AppRole | "">("");
  const [sportId, setSportId] = useState("");
  const [positionId, setPositionId] = useState("");
  const [organization, setOrganization] = useState("");

  const { data: positions = [] } = useSportPositions(sportId || null);

  useEffect(() => {
    if (!profile) return;
    setFirstName((current) => current || profile.first_name || "");
    setLastName((current) => current || profile.last_name || "");
  }, [profile]);

  useEffect(() => {
    if (!sportId && sports.length > 0) setSportId(sports[0]!.id);
  }, [sports, sportId]);

  useEffect(() => {
    setPositionId("");
  }, [sportId]);

  async function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!role) {
      toast.error("Pick your primary role");
      return;
    }
    try {
      await updateProfile.mutateAsync({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        primary_role: role,
        primary_sport_id: sportId || null,
        position_id: positionId || null,
        organization_name: organization.trim() || null,
        onboarding_completed: true,
      });
      navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your profile");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-xl border border-border bg-card p-6"
      >
        <p className="label-caps text-xs text-primary">Step 1 of 1</p>
        <h1 className="mt-2 text-3xl font-semibold uppercase">Set up your profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This tailors your film room. You can change all of it later in Settings.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="first-name">First name</Label>
            <Input
              id="first-name"
              required
              value={firstName}
              onChange={(inputEvent) => setFirstName(inputEvent.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last-name">Last name</Label>
            <Input
              id="last-name"
              required
              value={lastName}
              onChange={(inputEvent) => setLastName(inputEvent.target.value)}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Primary role</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ONBOARDING_ROLES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setRole(option)}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    role === option
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-surface-2 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {ROLE_LABELS[option]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Primary sport</Label>
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

          {positions.length > 0 ? (
            <div className="space-y-1.5">
              <Label>Position</Label>
              <Select value={positionId} onValueChange={setPositionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a position" />
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
          ) : null}

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="organization">Organization or team (optional)</Label>
            <Input
              id="organization"
              value={organization}
              onChange={(inputEvent) => setOrganization(inputEvent.target.value)}
              placeholder="Northside Prep"
            />
          </div>
        </div>

        <Button type="submit" className="mt-6 w-full" disabled={updateProfile.isPending}>
          Finish setup
        </Button>
      </form>
    </div>
  );
}
