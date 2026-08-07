import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { ShareResourceType } from "@/lib/sharing/sharing.functions";

export type SharePermission = "view" | "comment";
export type ShareStatus = "pending" | "active" | "revoked";

export type SharedResourceRecord = {
  id: string;
  resource_type: ShareResourceType;
  resource_id: string;
  shared_by_user_id: string;
  shared_with_user_id: string | null;
  shared_with_email: string | null;
  permission: SharePermission;
  status: ShareStatus;
  source_access_state: string;
  note: string | null;
  created_at: string;
  viewed_at: string | null;
};

const SHARE_COLUMNS =
  "id, resource_type, resource_id, shared_by_user_id, shared_with_user_id, shared_with_email, permission, status, source_access_state, note, created_at, viewed_at";

export const SHARE_TYPE_LABELS: Record<ShareResourceType, string> = {
  game: "Game film",
  playlist: "Playlist",
  film_review: "Film review",
  reel: "Reel",
  development_report: "Development report",
};

/** Everything shared *with* the signed-in user. */
export function useSharedWithMe() {
  return useQuery({
    queryKey: ["shares", "with-me"],
    queryFn: async (): Promise<SharedResourceRecord[]> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return [];
      const { data, error } = await supabase
        .from("shared_resources")
        .select(SHARE_COLUMNS)
        .eq("shared_with_user_id", auth.user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SharedResourceRecord[];
    },
  });
}

/** Shares the signed-in user created, optionally for one resource. */
export function useSharesByMe(resourceId?: string) {
  return useQuery({
    queryKey: ["shares", "by-me", resourceId ?? "all"],
    queryFn: async (): Promise<SharedResourceRecord[]> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return [];
      let query = supabase
        .from("shared_resources")
        .select(SHARE_COLUMNS)
        .eq("shared_by_user_id", auth.user.id);
      if (resourceId) query = query.eq("resource_id", resourceId);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SharedResourceRecord[];
    },
  });
}

export function useCreateShare() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      resource_type: ShareResourceType;
      resource_id: string;
      shared_with_user_id: string | null;
      shared_with_email: string;
      permission: SharePermission;
      note: string | null;
      source_access_state: string;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Your session expired. Sign in again.");
      const { error } = await supabase.from("shared_resources").upsert(
        {
          resource_type: input.resource_type,
          resource_id: input.resource_id,
          shared_by_user_id: auth.user.id,
          shared_with_user_id: input.shared_with_user_id,
          shared_with_email: input.shared_with_email,
          permission: input.permission,
          note: input.note,
          status: input.shared_with_user_id ? "active" : "pending",
          source_access_state: input.source_access_state as never,
        },
        { onConflict: "resource_type,resource_id,shared_with_user_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shares"] }),
  });
}

export function useRevokeShare() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shared_resources").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shares"] }),
  });
}

/** Recipients stamp first view so coaches can see the film landed. */
export function useMarkShareViewed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from("shared_resources")
        .update({ viewed_at: new Date().toISOString() })
        .eq("id", id)
        .is("viewed_at", null);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shares"] }),
  });
}
