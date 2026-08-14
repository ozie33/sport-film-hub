import type { SupabaseClient } from "@supabase/supabase-js";

import { FUNNEL_STEPS } from "@/lib/analytics/events";

type EventRow = {
  user_id: string;
  event_name: string;
  session_id: string;
  game_id: string | null;
  player_id: string | null;
  occurred_at: string;
};

export type FunnelStep = {
  key: string;
  label: string;
  users: number;
  events: number;
  conversionFromStart: number;
  conversionFromPrevious: number;
};

export type ProductAnalytics = {
  rangeDays: number;
  totalEvents: number;
  activeUsers: number;
  funnel: FunnelStep[];
  metrics: {
    medianMinutesLinkToFirstMark: number | null;
    averageMinutesLinkToFirstMark: number | null;
    averagePlaysPerReview: number | null;
    averageReviewSessionMinutes: number | null;
    pctUsersOrganizeReview: number | null;
    pctUsersBuildReel: number | null;
    pctUsersShareReel: number | null;
    pctUsersReturnToSameSubject: number | null;
    reviewSessions: number;
  };
  recent: { event_name: string; occurred_at: string; session_id: string }[];
};

function pct(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function round(value: number | null, digits = 1): number | null {
  if (value === null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Everything is derived from the raw event log so the funnel definition can
 * change without a schema migration or backfill.
 */
export async function computeProductAnalytics(
  supabase: SupabaseClient,
  rangeDays: number,
): Promise<ProductAnalytics> {
  const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("product_events")
    .select("user_id, event_name, session_id, game_id, player_id, occurred_at")
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: true })
    .limit(50000);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as EventRow[];

  const usersByEvent = new Map<string, Set<string>>();
  const countByEvent = new Map<string, number>();
  for (const row of rows) {
    countByEvent.set(row.event_name, (countByEvent.get(row.event_name) ?? 0) + 1);
    const set = usersByEvent.get(row.event_name) ?? new Set<string>();
    set.add(row.user_id);
    usersByEvent.set(row.event_name, set);
  }

  // Plays marked per (user, session, game) — one "review".
  const playsPerReview = new Map<string, number>();
  const marksPerUser = new Map<string, number>();
  for (const row of rows) {
    if (row.event_name !== "play_marked") continue;
    const key = `${row.user_id}|${row.session_id}|${row.game_id ?? "none"}`;
    playsPerReview.set(key, (playsPerReview.get(key) ?? 0) + 1);
    marksPerUser.set(row.user_id, (marksPerUser.get(row.user_id) ?? 0) + 1);
  }

  const milestoneUsers = (threshold: number) => {
    const users = new Set<string>();
    for (const [key, count] of playsPerReview) {
      if (count >= threshold) users.add(key.split("|")[0]!);
    }
    return users;
  };

  const usersFor = (key: string): Set<string> => {
    if (key === "first_play_marked") return milestoneUsers(1);
    if (key === "five_plays_marked") return milestoneUsers(5);
    if (key === "ten_plays_marked") return milestoneUsers(10);
    return usersByEvent.get(key) ?? new Set<string>();
  };

  const eventsFor = (key: string): number => {
    if (key === "first_play_marked" || key === "five_plays_marked" || key === "ten_plays_marked") {
      const threshold = key === "first_play_marked" ? 1 : key === "five_plays_marked" ? 5 : 10;
      let total = 0;
      for (const count of playsPerReview.values()) if (count >= threshold) total += 1;
      return total;
    }
    return countByEvent.get(key) ?? 0;
  };

  const startUsers = usersFor("youtube_link_added").size;
  const funnel: FunnelStep[] = [];
  let previous = startUsers;
  for (const step of FUNNEL_STEPS) {
    const users = usersFor(step.key).size;
    funnel.push({
      key: step.key,
      label: step.label,
      users,
      events: eventsFor(step.key),
      conversionFromStart: pct(users, startUsers) ?? 0,
      conversionFromPrevious: pct(users, previous) ?? 0,
    });
    previous = users;
  }

  // Time from YouTube link added to that game's first marked play.
  const firstLinkByGame = new Map<string, number>();
  const firstMarkByGame = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.user_id}|${row.game_id ?? "none"}`;
    const time = new Date(row.occurred_at).getTime();
    if (row.event_name === "youtube_link_added" && !firstLinkByGame.has(key)) {
      firstLinkByGame.set(key, time);
    }
    if (row.event_name === "play_marked" && !firstMarkByGame.has(key)) {
      firstMarkByGame.set(key, time);
    }
  }
  const linkToMarkMinutes: number[] = [];
  for (const [key, linkedAt] of firstLinkByGame) {
    const markedAt = firstMarkByGame.get(key);
    if (markedAt && markedAt >= linkedAt) linkToMarkMinutes.push((markedAt - linkedAt) / 60000);
  }

  // Review session length: span of events inside a session that started a review.
  const sessionSpans = new Map<string, { first: number; last: number; review: boolean }>();
  for (const row of rows) {
    const time = new Date(row.occurred_at).getTime();
    const existing = sessionSpans.get(row.session_id);
    const isReview = row.event_name === "smart_review_started" || row.event_name === "play_marked";
    if (existing) {
      existing.first = Math.min(existing.first, time);
      existing.last = Math.max(existing.last, time);
      existing.review = existing.review || isReview;
    } else {
      sessionSpans.set(row.session_id, { first: time, last: time, review: isReview });
    }
  }
  const reviewSessionMinutes: number[] = [];
  for (const span of sessionSpans.values()) {
    if (!span.review) continue;
    reviewSessionMinutes.push((span.last - span.first) / 60000);
  }

  // Return behaviour: same game or same athlete touched in 2+ distinct sessions.
  const sessionsBySubject = new Map<string, Set<string>>();
  for (const row of rows) {
    for (const subject of [row.game_id, row.player_id]) {
      if (!subject) continue;
      const key = `${row.user_id}|${subject}`;
      const set = sessionsBySubject.get(key) ?? new Set<string>();
      set.add(row.session_id);
      sessionsBySubject.set(key, set);
    }
  }
  const returningUsers = new Set<string>();
  for (const [key, sessions] of sessionsBySubject) {
    if (sessions.size >= 2) returningUsers.add(key.split("|")[0]!);
  }

  const reviewers = usersByEvent.get("smart_review_started") ?? new Set<string>();
  const reviewerBase = reviewers.size > 0 ? reviewers.size : new Set(rows.map((r) => r.user_id)).size;

  const activeUsers = new Set(rows.map((row) => row.user_id)).size;

  return {
    rangeDays,
    totalEvents: rows.length,
    activeUsers,
    funnel,
    metrics: {
      medianMinutesLinkToFirstMark: round(median(linkToMarkMinutes)),
      averageMinutesLinkToFirstMark: round(average(linkToMarkMinutes)),
      averagePlaysPerReview: round(average([...playsPerReview.values()])),
      averageReviewSessionMinutes: round(average(reviewSessionMinutes)),
      pctUsersOrganizeReview: pct((usersByEvent.get("organize_review_used") ?? new Set()).size, reviewerBase),
      pctUsersBuildReel: pct((usersByEvent.get("reel_completed") ?? new Set()).size, reviewerBase),
      pctUsersShareReel: pct((usersByEvent.get("reel_shared") ?? new Set()).size, reviewerBase),
      pctUsersReturnToSameSubject: pct(returningUsers.size, activeUsers),
      reviewSessions: reviewSessionMinutes.length,
    },
    recent: rows
      .slice(-25)
      .reverse()
      .map((row) => ({
        event_name: row.event_name,
        occurred_at: row.occurred_at,
        session_id: row.session_id.slice(0, 8),
      })),
  };
}
