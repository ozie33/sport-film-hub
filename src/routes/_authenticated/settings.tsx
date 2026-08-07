import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/stat-card";
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
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { ONBOARDING_ROLES, ROLE_LABELS, type AppRole } from "@/lib/domain";
import {
  useProfile,
  useSportPositions,
  useSports,
  useUpdateProfile,
} from "@/lib/data/queries";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — CourtBase" },
      { name: "description", content: "Update your profile, sport, position and demo data preference." },
      { property: "og:title", content: "Settings — CourtBase" },
      { property: "og:description", content: "Profile, sport, position and demo data preference." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { data: profile } = useProfile();
  const { data: sports = [] } = useSports();
  const updateProfile = useUpdateProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<AppRole | "">("");
  const [sportId, setSportId] = useState("");
  const [positionId, setPositionId] = useState("");
  const [organization, setOrganization] = useState("");

  const { data: positions = [] } = useSportPositions(sportId || null);

  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.first_name ?? "");
    setLastName(profile.last_name ?? "");
    setRole(profile.primary_role ?? "");
    setSportId(profile.primary_sport_id ?? "");
    setPositionId(profile.position_id ?? "");
    setOrganization(profile.organization_name ?? "");
  }, [profile]);

  async function handleSave(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    try {
      await updateProfile.mutateAsync({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        primary_role: role || null,
        primary_sport_id: sportId || null,
        position_id: positionId || null,
        organization_name: organization.trim() || null,
      });
      toast.success("Settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your settings");
    }
  }

  async function handleDemoToggle(next: boolean) {
    try {
      await updateProfile.mutateAsync({ demo_mode: next });
      toast.success(next ? "Demo data enabled" : "Demo data hidden");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update demo mode");
    }
  }

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        description="Your profile, sport preferences and demo data controls."
      />

      <SectionCard title="Profile" description="Used across your dashboard and reports">
        <form onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="settings-first">First name</Label>
            <Input
              id="settings-first"
              value={firstName}
              onChange={(inputEvent) => setFirstName(inputEvent.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-last">Last name</Label>
            <Input
              id="settings-last"
              value={lastName}
              onChange={(inputEvent) => setLastName(inputEvent.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Primary role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as AppRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {ONBOARDING_ROLES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {ROLE_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="settings-org">Organization or team</Label>
            <Input
              id="settings-org"
              value={organization}
              onChange={(inputEvent) => setOrganization(inputEvent.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={updateProfile.isPending}>
              Save changes
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Demo Data" description="Preview the interface with clearly labeled sample data">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-xl">
            <p className="text-sm">Show demo data where your library is empty</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Demo content is rendered in the interface only. It is never written to your account,
              and every demo surface is labeled.
            </p>
          </div>
          <Switch
            checked={profile?.demo_mode ?? false}
            onCheckedChange={handleDemoToggle}
            aria-label="Toggle demo data"
          />
        </div>
      </SectionCard>

      <SectionCard title="Account">
        <Button variant="outline" onClick={handleSignOut}>
          Sign out
        </Button>
      </SectionCard>
    </AppShell>
  );
}
