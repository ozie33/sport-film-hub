import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { ExternalLinkProvider, PlayerReferenceType } from "@/lib/identity/identity";

export const REFERENCE_BUCKET = "player-references";

/* ----------------------------------- teams ---------------------------------- */

export type TeamRecord = {
  id: string;
  organization_name: string | null;
  team_name: string;
  sport_id: string | null;
  season: string | null;
  level: string | null;
  coach_name: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  notes: string | null;
  created_at: string;
};

export type TeamInput = Omit<TeamRecord, "id" | "created_at">;

const TEAM_COLUMNS =
  "id, organization_name, team_name, sport_id, season, level, coach_name, primary_color, secondary_color, notes, created_at";

export function useTeams() {
  return useQuery({
    queryKey: ["teams"],
    queryFn: async (): Promise<TeamRecord[]> => {
      const { data, error } = await supabase
        .from("teams")
        .select(TEAM_COLUMNS)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TeamRecord[];
    },
  });
}

export function useSaveTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string | undefined; values: TeamInput }) => {
      if (id) {
        const { error } = await supabase.from("teams").update(values).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("teams")
        .insert({ ...values, owner_id: auth.user.id })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      queryClient.invalidateQueries({ queryKey: ["memberships"] });
    },
  });
}

export function useDeleteTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("teams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      queryClient.invalidateQueries({ queryKey: ["memberships"] });
    },
  });
}

/* ------------------------------- memberships -------------------------------- */

export type MembershipRecord = {
  id: string;
  player_id: string;
  team_id: string;
  jersey_number: string | null;
  position_id: string | null;
  position_label: string | null;
  season: string | null;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  is_current: boolean;
  created_at: string;
  teams: TeamRecord | null;
};

export type MembershipInput = {
  player_id: string;
  team_id: string;
  jersey_number: string | null;
  position_id: string | null;
  position_label: string | null;
  season: string | null;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  is_current: boolean;
};

const MEMBERSHIP_COLUMNS = `id, player_id, team_id, jersey_number, position_id, position_label, season, start_date, end_date, active, is_current, created_at, teams(${TEAM_COLUMNS})`;

/** All memberships for the signed-in user — powers player search by team/jersey/season. */
export function useMemberships() {
  return useQuery({
    queryKey: ["memberships"],
    queryFn: async (): Promise<MembershipRecord[]> => {
      const { data, error } = await supabase
        .from("player_team_memberships")
        .select(MEMBERSHIP_COLUMNS)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as MembershipRecord[];
    },
  });
}

export function usePlayerMemberships(playerId?: string | null) {
  return useQuery({
    queryKey: ["memberships", "player", playerId],
    enabled: Boolean(playerId),
    queryFn: async (): Promise<MembershipRecord[]> => {
      const { data, error } = await supabase
        .from("player_team_memberships")
        .select(MEMBERSHIP_COLUMNS)
        .eq("player_id", playerId!)
        .order("is_current", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as MembershipRecord[];
    },
  });
}

export function useSaveMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string | undefined; values: MembershipInput }) => {
      if (id) {
        const { error } = await supabase.from("player_team_memberships").update(values).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from("player_team_memberships")
        .insert(values)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["memberships"] }),
  });
}

export function useDeleteMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("player_team_memberships").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["memberships"] }),
  });
}

/** Marks one membership current and clears the flag on the player's other rows. */
export function useSetCurrentMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ playerId, membershipId }: { playerId: string; membershipId: string }) => {
      const { error: clearError } = await supabase
        .from("player_team_memberships")
        .update({ is_current: false })
        .eq("player_id", playerId);
      if (clearError) throw clearError;
      const { error } = await supabase
        .from("player_team_memberships")
        .update({ is_current: true, active: true })
        .eq("id", membershipId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["memberships"] }),
  });
}

/* ---------------------------- reference media ------------------------------- */

export type ReferenceMediaRecord = {
  id: string;
  player_id: string;
  reference_type: PlayerReferenceType;
  provider: string;
  file_reference: string | null;
  thumbnail_url: string | null;
  mime_type: string | null;
  notes: string | null;
  source_game_id: string | null;
  ai_generated: boolean;
  confidence_score: number | null;
  active: boolean;
  created_at: string;
};

const REFERENCE_COLUMNS =
  "id, player_id, reference_type, provider, file_reference, thumbnail_url, mime_type, notes, source_game_id, ai_generated, confidence_score, active, created_at";

export function usePlayerReferences(playerId?: string | null) {
  return useQuery({
    queryKey: ["player-references", playerId],
    enabled: Boolean(playerId),
    queryFn: async (): Promise<ReferenceMediaRecord[]> => {
      const { data, error } = await supabase
        .from("player_reference_media")
        .select(REFERENCE_COLUMNS)
        .eq("player_id", playerId!)
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ReferenceMediaRecord[];
    },
  });
}

export function useCreateReference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      player_id: string;
      reference_type: PlayerReferenceType;
      provider: string;
      file_reference: string;
      mime_type: string | null;
      notes: string | null;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("player_reference_media")
        .insert({ ...values, uploaded_by: auth.user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: (_result, variables) =>
      queryClient.invalidateQueries({ queryKey: ["player-references", variables.player_id] }),
  });
}

export function useDeleteReference(playerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reference: ReferenceMediaRecord) => {
      if (reference.provider === "upload" && reference.file_reference) {
        await supabase.storage.from(REFERENCE_BUCKET).remove([reference.file_reference]);
      }
      const { error } = await supabase
        .from("player_reference_media")
        .delete()
        .eq("id", reference.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["player-references", playerId] }),
  });
}

/** Signed URL for a private reference file so previews work without a public bucket. */
export function useReferenceUrl(reference: ReferenceMediaRecord | null | undefined) {
  const path = reference?.provider === "upload" ? reference.file_reference : null;
  return useQuery({
    queryKey: ["reference-url", path],
    enabled: Boolean(path),
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.storage
        .from(REFERENCE_BUCKET)
        .createSignedUrl(path!, 60 * 60);
      if (error) throw error;
      return data?.signedUrl ?? null;
    },
  });
}

/* --------------------------- external reference links ------------------------ */

export type ExternalLinkRecord = {
  id: string;
  player_id: string;
  provider: ExternalLinkProvider;
  url: string;
  label: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
};

export function usePlayerLinks(playerId?: string | null) {
  return useQuery({
    queryKey: ["player-links", playerId],
    enabled: Boolean(playerId),
    queryFn: async (): Promise<ExternalLinkRecord[]> => {
      const { data, error } = await supabase
        .from("external_reference_links")
        .select("id, player_id, provider, url, label, notes, active, created_at")
        .eq("player_id", playerId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ExternalLinkRecord[];
    },
  });
}

export function useCreateLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      player_id: string;
      provider: ExternalLinkProvider;
      url: string;
      label: string | null;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("external_reference_links")
        .insert({ ...values, created_by: auth.user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: (_result, variables) =>
      queryClient.invalidateQueries({ queryKey: ["player-links", variables.player_id] }),
  });
}

export function useDeleteLink(playerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("external_reference_links").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["player-links", playerId] }),
  });
}

/* --------------------------------- helpers ---------------------------------- */

export function teamDisplayName(
  team: { team_name: string; organization_name: string | null } | null | undefined,
): string {
  if (!team) return "Unknown team";
  return [team.organization_name, team.team_name].filter(Boolean).join(" · ");
}

export function currentMembership(
  memberships: MembershipRecord[],
): MembershipRecord | null {
  return (
    memberships.find((membership) => membership.is_current) ??
    memberships.find((membership) => membership.active) ??
    memberships[0] ??
    null
  );
}

export function buildReferenceStoragePath(
  userId: string,
  playerId: string,
  fileName: string,
): string {
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
  return `${userId}/${playerId}/${Date.now()}-${safeName}`;
}