import { supabase } from "@/integrations/supabase/client";

import type { ProductEventName } from "@/lib/analytics/events";

const SESSION_KEY = "cb.analytics.session";
const ONCE_PREFIX = "cb.analytics.once:";

/**
 * A "session" is one browsing session in this tab. Review session length is
 * derived server-side from the first and last event sharing a session id, so
 * instrumentation stays passive and never touches the review UX.
 */
export function analyticsSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return "unavailable";
  }
}

type TrackOptions = {
  gameId?: string | null;
  playerId?: string | null;
  reelId?: string | null;
  properties?: Record<string, unknown>;
  /** Only record this event once per session for the given scope key. */
  oncePerSession?: string;
};

/** Fire-and-forget: analytics must never block or break a user action. */
export function trackEvent(name: ProductEventName, options: TrackOptions = {}): void {
  if (typeof window === "undefined") return;

  if (options.oncePerSession) {
    const key = `${ONCE_PREFIX}${name}:${options.oncePerSession}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      /* storage unavailable — fall through and record the event */
    }
  }

  void (async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) return;
      await supabase.from("product_events").insert({
        user_id: userId,
        event_name: name,
        session_id: analyticsSessionId(),
        game_id: options.gameId ?? null,
        player_id: options.playerId ?? null,
        reel_id: options.reelId ?? null,
        properties: (options.properties ?? {}) as never,
      });
    } catch {
      /* analytics is best-effort */
    }
  })();
}
