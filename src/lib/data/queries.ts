import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { AppRole, EventTypeRecord, SportPosition, SportRecord } from "@/lib/domain";

/* ---------------------------------- catalog --------------------------------- */

export function useSports() {
  return useQuery({
    queryKey: ["sports"],
    queryFn: async (): Promise<SportRecord[]> => {
      const { data, error } = await supabase
        .from("sports")
        .select("id, key, name, is_active, sort_order")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as SportRecord[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useSportPositions(sportId?: string | null) {
  return useQuery({
    queryKey: ["sport-positions", sportId],
    enabled: Boolean(sportId),
    queryFn: async (): Promise<SportPosition[]> => {
      const { data, error } = await supabase
        .from("sport_positions")
        .select("id, sport_id, key, name, abbreviation, sort_order")
        .eq("sport_id", sportId!)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as SportPosition[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useEventTypes(sportId?: string | null) {
  return useQuery({
    queryKey: ["event-types", sportId],
    enabled: Boolean(sportId),
    queryFn: async (): Promise<EventTypeRecord[]> => {
      const { data, error } = await supabase
        .from("event_types")
        .select("id, sport_id, key, name, default_side, subtypes, outcomes, sort_order")
        .eq("sport_id", sportId!)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        subtypes: Array.isArray(row.subtypes) ? (row.subtypes as string[]) : [],
        outcomes: Array.isArray(row.outcomes) ? (row.outcomes as string[]) : [],
      })) as EventTypeRecord[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/* ---------------------------------- profile --------------------------------- */

export type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  primary_role: AppRole | null;
  primary_sport_id: string | null;
  position_id: string | null;
  organization_name: string | null;
  onboarding_completed: boolean;
  demo_mode: boolean;
};

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async (): Promise<Profile | null> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, first_name, last_name, avatar_url, primary_role, primary_sport_id, position_id, organization_name, onboarding_completed, demo_mode",
        )
        .eq("id", auth.user.id)
        .maybeSingle();
      if (error) throw error;
      if (data) return data as Profile;
      const { data: created, error: insertError } = await supabase
        .from("profiles")
        .insert({ id: auth.user.id })
        .select(
          "id, first_name, last_name, avatar_url, primary_role, primary_sport_id, position_id, organization_name, onboarding_completed, demo_mode",
        )
        .single();
      if (insertError) throw insertError;
      return created as Profile;
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<Profile, "id">>) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { error } = await supabase.from("profiles").update(patch).eq("id", auth.user.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile"] }),
  });
}

/* ---------------------------------- players --------------------------------- */

export type PlayerRecord = {
  id: string;
  first_name: string;
  last_name: string;
  image_url: string | null;
  sport_id: string;
  team_name: string | null;
  jersey_number: string | null;
  position_id: string | null;
  height: string | null;
  graduation_year: number | null;
  dominant_hand: string | null;
  notes: string | null;
  created_at: string;
};

const PLAYER_COLUMNS =
  "id, first_name, last_name, image_url, sport_id, team_name, jersey_number, position_id, height, graduation_year, dominant_hand, notes, created_at";

export function usePlayers() {
  return useQuery({
    queryKey: ["players"],
    queryFn: async (): Promise<PlayerRecord[]> => {
      const { data, error } = await supabase
        .from("players")
        .select(PLAYER_COLUMNS)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PlayerRecord[];
    },
  });
}

export function usePlayer(playerId: string) {
  return useQuery({
    queryKey: ["player", playerId],
    queryFn: async (): Promise<PlayerRecord | null> => {
      const { data, error } = await supabase
        .from("players")
        .select(PLAYER_COLUMNS)
        .eq("id", playerId)
        .maybeSingle();
      if (error) throw error;
      return (data as PlayerRecord) ?? null;
    },
  });
}

export type PlayerInput = Omit<PlayerRecord, "id" | "created_at">;

export function useSavePlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: PlayerInput }) => {
      if (id) {
        const { error } = await supabase.from("players").update(values).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase.from("players").insert(values).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["players"] });
      queryClient.invalidateQueries({ queryKey: ["player"] });
    },
  });
}

export function useDeletePlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("players").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["players"] }),
  });
}

/* ----------------------------------- games ---------------------------------- */

export type GameRecord = {
  id: string;
  sport_id: string;
  title: string;
  opponent: string | null;
  game_date: string | null;
  is_home: boolean | null;
  notes: string | null;
  video_status: string;
  analysis_status: string;
  clip_count: number;
  created_at: string;
  game_players: { player_id: string; is_primary: boolean; players: { first_name: string; last_name: string } | null }[];
};

const GAME_COLUMNS =
  "id, sport_id, title, opponent, game_date, is_home, notes, video_status, analysis_status, clip_count, created_at, game_players(player_id, is_primary, players(first_name, last_name))";

export function useGames() {
  return useQuery({
    queryKey: ["games"],
    queryFn: async (): Promise<GameRecord[]> => {
      const { data, error } = await supabase
        .from("games")
        .select(GAME_COLUMNS)
        .order("game_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as GameRecord[];
    },
  });
}

export function useGame(gameId: string) {
  return useQuery({
    queryKey: ["game", gameId],
    queryFn: async (): Promise<GameRecord | null> => {
      const { data, error } = await supabase
        .from("games")
        .select(GAME_COLUMNS)
        .eq("id", gameId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as GameRecord) ?? null;
    },
  });
}

export type GameInput = {
  sport_id: string;
  title: string;
  opponent: string | null;
  game_date: string | null;
  is_home: boolean | null;
  notes: string | null;
  player_ids: string[];
};

export function useCreateGame() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: GameInput) => {
      const { player_ids, ...game } = input;
      const { data, error } = await supabase.from("games").insert(game).select("id").single();
      if (error) throw error;
      const gameId = data.id as string;
      if (player_ids.length > 0) {
        const { error: linkError } = await supabase.from("game_players").insert(
          player_ids.map((playerId, index) => ({
            game_id: gameId,
            player_id: playerId,
            is_primary: index === 0,
          })),
        );
        if (linkError) throw linkError;
      }
      return gameId;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["games"] }),
  });
}

export function useDeleteGame() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("games").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["games"] }),
  });
}

/* ----------------------------------- events ---------------------------------- */

export type EventRecord = {
  id: string;
  game_id: string;
  player_id: string | null;
  event_type_key: string | null;
  event_subtype: string | null;
  outcome: string | null;
  possession_type: string | null;
  offense_or_defense: string;
  start_time: number;
  end_time: number | null;
  tags: string[];
  notes: string | null;
  approved: boolean;
  source: string;
  confidence_score: number | null;
};

export function useGameEvents(gameId: string) {
  return useQuery({
    queryKey: ["game-events", gameId],
    queryFn: async (): Promise<EventRecord[]> => {
      const { data, error } = await supabase
        .from("events")
        .select(
          "id, game_id, player_id, event_type_key, event_subtype, outcome, possession_type, offense_or_defense, start_time, end_time, tags, notes, approved, source, confidence_score",
        )
        .eq("game_id", gameId)
        .order("start_time");
      if (error) throw error;
      return (data ?? []) as unknown as EventRecord[];
    },
  });
}

export type EventInput = {
  game_id: string;
  player_id: string | null;
  event_type_key: string;
  event_subtype: string | null;
  outcome: string | null;
  offense_or_defense: string;
  start_time: number;
  end_time: number | null;
  notes: string | null;
};

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: EventInput) => {
      const { error } = await supabase.from("events").insert({ ...input, source: "manual" });
      if (error) throw error;
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["game-events", variables.game_id] });
      queryClient.invalidateQueries({ queryKey: ["games"] });
    },
  });
}

export function useDeleteEvent(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase.from("events").delete().eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["game-events", gameId] }),
  });
}
