import { useState } from "react";
import { Pencil, Plus, Star, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/empty-state";
import { SectionCard } from "@/components/common/stat-card";
import { Tag } from "@/components/common/status-badge";
import { MembershipDialog } from "@/components/players/membership-dialog";
import { TeamFormDialog } from "@/components/teams/team-form-dialog";
import { Button } from "@/components/ui/button";
import {
  teamDisplayName,
  useDeleteMembership,
  usePlayerMemberships,
  useSetCurrentMembership,
  type MembershipRecord,
} from "@/lib/data/identity-queries";

export function PlayerTeamsTab({
  playerId,
  sportId,
}: {
  playerId: string;
  sportId: string | null;
}) {
  const { data: memberships = [], isLoading } = usePlayerMemberships(playerId);
  const deleteMembership = useDeleteMembership();
  const setCurrent = useSetCurrentMembership();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MembershipRecord | null>(null);
  const [teamEdit, setTeamEdit] = useState<MembershipRecord | null>(null);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }

  return (
    <SectionCard
      title="Teams"
      description="One athlete can belong to several teams at the same time — no duplicate profiles."
      actions={
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1 size-4" /> Add Team
        </Button>
      }
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading teams…</p>
      ) : memberships.length === 0 ? (
        <EmptyState
          icon={<Users className="size-8" />}
          title="No team memberships yet"
          description="Add the high school, AAU, academy or summer league teams this athlete plays for."
          action={<Button onClick={openNew}>Add First Team</Button>}
        />
      ) : (
        <ul className="space-y-3">
          {memberships.map((membership) => (
            <li
              key={membership.id}
              className="rounded-xl border border-border bg-surface/60 p-4"
              style={
                membership.teams?.primary_color
                  ? { borderLeft: `4px solid ${membership.teams.primary_color}` }
                  : undefined
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold uppercase">
                    {teamDisplayName(membership.teams)}
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {membership.is_current ? <Tag>Current team</Tag> : null}
                    {membership.active ? null : <Tag>Past</Tag>}
                    {membership.jersey_number ? <Tag>#{membership.jersey_number}</Tag> : null}
                    {membership.position_label ? <Tag>{membership.position_label}</Tag> : null}
                    {membership.season ? <Tag>{membership.season}</Tag> : null}
                    {membership.teams?.level ? <Tag>{membership.teams.level}</Tag> : null}
                    {membership.teams?.coach_name ? (
                      <Tag>Coach {membership.teams.coach_name}</Tag>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {membership.is_current ? null : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void setCurrent
                          .mutateAsync({ playerId, membershipId: membership.id })
                          .then(() => toast.success("Current team updated"))
                      }
                    >
                      <Star className="mr-1 size-4" /> Mark current
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(membership);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="mr-1 size-4" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setTeamEdit(membership)}>
                    Team details
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove membership"
                    onClick={() =>
                      void deleteMembership
                        .mutateAsync(membership.id)
                        .then(() => toast.success("Membership removed"))
                        .catch((error: unknown) =>
                          toast.error(
                            error instanceof Error ? error.message : "Could not remove membership",
                          ),
                        )
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <MembershipDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        playerId={playerId}
        sportId={sportId}
        membership={editing}
      />
      <TeamFormDialog
        open={Boolean(teamEdit)}
        onOpenChange={(next) => {
          if (!next) setTeamEdit(null);
        }}
        team={teamEdit?.teams ?? null}
        defaultSportId={sportId}
      />
    </SectionCard>
  );
}