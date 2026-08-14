/**
 * AI post-processing over an existing human review.
 *
 * Every function here reads only structured review data — marked plays, their
 * timestamps, event tags, outcomes, notes and ratings — and asks a language
 * model to organize, sequence or summarize it. Nothing here watches video, so
 * results are always described as coming from reviewed plays.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type {
  DevelopmentSummaryContent,
  GameStoryContent,
  OrganizeResult,
} from "@/lib/ai/review-ai";

type Client = SupabaseClient<Database>;

export const AI_MODEL = "google/gemini-2.5-flash";

/* -------------------------------------------------------------------------- */
/* Gateway                                                                     */
/* -------------------------------------------------------------------------- */

async function callAiJson<T>(system: string, user: string): Promise<T> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured for this project yet.");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${system}\nAlways reply with a single json object.` },
        { role: "user", content: user },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 429) throw new Error("AI is busy right now — try again in a moment.");
    if (response.status === 402)
      throw new Error("AI credits are exhausted for this workspace. Add credits to continue.");
    throw new Error(`AI request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = payload.choices?.[0]?.message?.content ?? "";
  return parseJson<T>(text);
}

function parseJson<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    throw new Error("The AI response could not be read. Try again.");
  }
}

/* -------------------------------------------------------------------------- */
/* Review dataset                                                              */
/* -------------------------------------------------------------------------- */

export type ReviewClip = {
  id: string;
  gameId: string | null;
  gameTitle: string;
  opponent: string | null;
  gameDate: string | null;
  playerId: string | null;
  playerName: string;
  title: string;
  category: string | null;
  eventType: string | null;
  eventSubtype: string | null;
  outcome: string | null;
  side: string | null;
  tags: string[];
  notes: string | null;
  start: number;
  end: number;
  duration: number;
  rating: number | null;
  source: string | null;
};

const CLIP_SELECT = `
  id, title, category, player_id, game_id, start_time, end_time, source, approved, metadata,
  players ( id, first_name, last_name ),
  games ( id, title, opponent, game_date ),
  events ( id, event_type_key, event_subtype, outcome, offense_or_defense, tags, notes ),
  evaluations ( overall_score, decision_score, impact_score, notes )
`;

/* eslint-disable @typescript-eslint/no-explicit-any */
type RawClip = any;

function toReviewClip(row: RawClip): ReviewClip {
  const event = row.events ?? null;
  const evaluation = Array.isArray(row.evaluations) ? row.evaluations[0] : row.evaluations;
  const player = row.players ?? null;
  const game = row.games ?? null;
  const start = Number(row.start_time ?? 0);
  const end = Number(row.end_time ?? start);
  return {
    id: row.id,
    gameId: row.game_id ?? null,
    gameTitle: game?.title ?? "Game",
    opponent: game?.opponent ?? null,
    gameDate: game?.game_date ?? null,
    playerId: row.player_id ?? null,
    playerName: [player?.first_name, player?.last_name].filter(Boolean).join(" ") || "Player",
    title: row.title ?? row.category ?? event?.event_type_key ?? "Clip",
    category: row.category ?? null,
    eventType: event?.event_type_key ?? null,
    eventSubtype: event?.event_subtype ?? null,
    outcome: event?.outcome ?? null,
    side: event?.offense_or_defense ?? null,
    tags: Array.isArray(event?.tags) ? (event.tags as string[]) : [],
    notes: event?.notes ?? evaluation?.notes ?? null,
    start,
    end,
    duration: Math.max(0, end - start),
    rating: evaluation?.overall_score ?? null,
    source: row.source ?? null,
  };
}

export async function loadReviewClips(
  supabase: Client,
  scope: { gameId?: string | null; playerId?: string | null; gameIds?: string[] | null },
): Promise<ReviewClip[]> {
  let query = supabase.from("clips").select(CLIP_SELECT).order("start_time", { ascending: true });
  if (scope.gameId) query = query.eq("game_id", scope.gameId);
  if (scope.gameIds && scope.gameIds.length > 0) query = query.in("game_id", scope.gameIds);
  if (scope.playerId) query = query.eq("player_id", scope.playerId);

  const { data, error } = await query.limit(400);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toReviewClip(row as RawClip));
}

/** Compact, token-cheap representation the model reasons over. */
function serializeClips(clips: ReviewClip[]) {
  return clips
    .map((clip, index) =>
      [
        `#${index + 1}`,
        `id=${clip.id}`,
        `game=${clip.gameTitle}${clip.opponent ? ` vs ${clip.opponent}` : ""}`,
        `player=${clip.playerName}`,
        `label=${clip.title}`,
        clip.eventType ? `event=${clip.eventType}` : null,
        clip.eventSubtype ? `subtype=${clip.eventSubtype}` : null,
        clip.outcome ? `outcome=${clip.outcome}` : null,
        clip.side ? `side=${clip.side}` : null,
        clip.tags.length > 0 ? `tags=${clip.tags.join("|")}` : null,
        clip.rating != null ? `rating=${clip.rating}` : null,
        `t=${Math.round(clip.start)}-${Math.round(clip.end)}s`,
        clip.notes ? `note="${clip.notes.slice(0, 160)}"` : null,
      ]
        .filter(Boolean)
        .join(" "),
    )
    .join("\n");
}

function keepKnownIds(ids: unknown, clips: ReviewClip[]): string[] {
  const known = new Set(clips.map((clip) => clip.id));
  const list = Array.isArray(ids) ? ids : [];
  const seen = new Set<string>();
  return list
    .filter((id): id is string => typeof id === "string" && known.has(id) && !seen.has(id))
    .map((id) => {
      seen.add(id);
      return id;
    });
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

/* -------------------------------------------------------------------------- */
/* Organize my review                                                          */
/* -------------------------------------------------------------------------- */

export async function organizeReview(
  supabase: Client,
  userId: string,
  scope: { gameId?: string | null; playerId?: string | null },
): Promise<OrganizeResult> {
  const clips = await loadReviewClips(supabase, scope);
  if (clips.length === 0) {
    return { reviewedClipCount: 0, playlists: [], themes: [], tagNormalizations: [] };
  }

  const result = await callAiJson<{
    playlists?: { name?: string; description?: string; theme?: string; clipIds?: string[] }[];
    themes?: string[];
    tagNormalizations?: { from?: string; to?: string }[];
  }>(
    "You are a basketball film assistant. You only see structured notes a coach already made about marked plays — you never watch video. Group those plays into useful review playlists.",
    `Reviewed plays:\n${serializeClips(clips)}\n\nReturn json:
{"playlists":[{"name":"short playlist name","description":"one sentence","theme":"strength|weakness|situational|scoring|defense|decision","clipIds":["<clip id>"]}],
"themes":["short theme phrase"],
"tagNormalizations":[{"from":"messy tag","to":"clean tag"}]}
Rules: 3-8 playlists, every clipIds entry must be an id from the list above, no empty playlists, names under 40 characters.`,
  );

  const scopeKey = scope.gameId ? `game:${scope.gameId}` : `player:${scope.playerId ?? "all"}`;

  // Replace previous AI playlists for the same scope so re-running is idempotent.
  const { data: previous } = await supabase
    .from("playlists")
    .select("id, metadata")
    .eq("owner_id", userId)
    .eq("is_system", false);
  const stale = (previous ?? []).filter((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    return meta["ai_generated"] === true && meta["ai_scope"] === scopeKey;
  });
  if (stale.length > 0) {
    await supabase
      .from("playlists")
      .delete()
      .in(
        "id",
        stale.map((row) => row.id),
      );
  }

  const created: OrganizeResult["playlists"] = [];
  for (const playlist of result.playlists ?? []) {
    const clipIds = keepKnownIds(playlist.clipIds, clips);
    const name = (playlist.name ?? "").trim();
    if (!name || clipIds.length === 0) continue;

    const { data: inserted, error } = await supabase
      .from("playlists")
      .insert({
        name,
        description: playlist.description ?? null,
        owner_id: userId,
        player_id: scope.playerId ?? clips.find((clip) => clip.playerId)?.playerId ?? null,
        game_id: scope.gameId ?? null,
        metadata: {
          ai_generated: true,
          ai_scope: scopeKey,
          theme: playlist.theme ?? null,
          model_version: AI_MODEL,
          reviewed_clip_count: clips.length,
          clip_count: clipIds.length,
        },
      })
      .select("id, name, description")
      .single();
    if (error || !inserted) continue;

    await supabase.from("playlist_clips").insert(
      clipIds.map((clipId, index) => ({
        playlist_id: inserted.id,
        clip_id: clipId,
        position: index,
      })),
    );

    created.push({
      id: inserted.id,
      name: inserted.name,
      description: inserted.description ?? null,
      clipCount: clipIds.length,
    });
  }

  return {
    reviewedClipCount: clips.length,
    playlists: created,
    themes: (result.themes ?? []).filter((theme): theme is string => typeof theme === "string"),
    tagNormalizations: (result.tagNormalizations ?? [])
      .filter((entry) => entry.from && entry.to)
      .map((entry) => ({ from: entry.from as string, to: entry.to as string })),
  };
}

/* -------------------------------------------------------------------------- */
/* Playlist from a prompt                                                      */
/* -------------------------------------------------------------------------- */

export async function generatePlaylistFromPrompt(
  supabase: Client,
  userId: string,
  input: { prompt: string; gameId?: string | null; playerId?: string | null },
) {
  const clips = await loadReviewClips(supabase, {
    gameId: input.gameId ?? null,
    playerId: input.playerId ?? null,
  });
  if (clips.length === 0) throw new Error("There are no reviewed plays to build a playlist from.");

  const result = await callAiJson<{ name?: string; description?: string; clipIds?: string[] }>(
    "You build film playlists from a coach's marked plays. You never watch video.",
    `Request: "${input.prompt}"\n\nReviewed plays:\n${serializeClips(clips)}\n\nReturn json {"name":"...","description":"...","clipIds":["<clip id>"]} using only ids above, best match first.`,
  );

  const clipIds = keepKnownIds(result.clipIds, clips);
  if (clipIds.length === 0) throw new Error("No reviewed plays matched that request.");

  const { data: inserted, error } = await supabase
    .from("playlists")
    .insert({
      name: (result.name ?? input.prompt).slice(0, 80),
      description: result.description ?? null,
      owner_id: userId,
      player_id: input.playerId ?? clips.find((clip) => clip.playerId)?.playerId ?? null,
      game_id: input.gameId ?? null,
      system_key: `ai-${slug(result.name ?? input.prompt)}`,
      metadata: {
        ai_generated: true,
        ai_prompt: input.prompt,
        model_version: AI_MODEL,
        reviewed_clip_count: clips.length,
        clip_count: clipIds.length,
      },
    })
    .select("id, name, description")
    .single();
  if (error || !inserted) throw new Error(error?.message ?? "Could not save the playlist.");

  await supabase.from("playlist_clips").insert(
    clipIds.map((clipId, index) => ({ playlist_id: inserted.id, clip_id: clipId, position: index })),
  );

  return {
    id: inserted.id,
    name: inserted.name,
    description: inserted.description ?? null,
    clipCount: clipIds.length,
    reviewedClipCount: clips.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Reel builder                                                                */
/* -------------------------------------------------------------------------- */

export type BuildReelInput = {
  mode: string;
  playerId?: string | null;
  gameIds?: string[] | null;
  customPrompt?: string | null;
  maxClips?: number | null;
  adjustments?: string[] | null;
  parentReelId?: string | null;
};

const MODE_BRIEF: Record<string, string> = {
  best_plays: "Only the strongest, highest-impact plays. Lead with the best one.",
  scoring: "Scoring plays: finishes, jumpers, drives that produced points.",
  complete_review: "A balanced review: strengths first, then teaching moments, ordered by theme.",
  defense: "Defensive plays: on-ball defense, help, closeouts, steals, blocks, rebounds.",
  development: "Teaching reel: mistakes, poor reads and habits worth correcting.",
  custom: "Follow the user's request exactly.",
};

export async function buildReel(supabase: Client, userId: string, input: BuildReelInput) {
  const clips = await loadReviewClips(supabase, {
    playerId: input.playerId ?? null,
    gameIds: input.gameIds && input.gameIds.length > 0 ? input.gameIds : null,
  });
  if (clips.length === 0) throw new Error("There are no reviewed plays to build a reel from.");

  const adjustments = (input.adjustments ?? []).join(", ");
  const result = await callAiJson<{
    title?: string;
    summary?: string;
    clips?: { id?: string; reason?: string }[];
  }>(
    "You sequence basketball highlight and development reels from a coach's marked plays. You never watch video — you order plays using their labels, outcomes, notes and ratings.",
    `Reel type: ${input.mode} — ${MODE_BRIEF[input.mode] ?? MODE_BRIEF["custom"]}
${input.customPrompt ? `User request: "${input.customPrompt}"` : ""}
${adjustments ? `Adjustments to apply: ${adjustments}` : ""}
Target length: up to ${input.maxClips ?? 12} plays.

Reviewed plays:
${serializeClips(clips)}

Return json {"title":"short reel title","summary":"2 sentences on what this reel shows","clips":[{"id":"<clip id>","reason":"why it is here and in this spot"}]} — ordered for viewing, ids only from the list above.`,
  );

  const ordered = (result.clips ?? [])
    .map((entry) => ({ id: entry.id, reason: entry.reason ?? null }))
    .filter((entry): entry is { id: string; reason: string | null } => typeof entry.id === "string");
  const allowed = new Set(clips.map((clip) => clip.id));
  const seen = new Set<string>();
  const selection = ordered.filter((entry) => {
    if (!allowed.has(entry.id) || seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
  if (selection.length === 0) throw new Error("The AI did not select any usable plays. Try again.");

  const sourceGameIds = Array.from(
    new Set(
      selection
        .map((entry) => clips.find((clip) => clip.id === entry.id)?.gameId)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  let version = 1;
  if (input.parentReelId) {
    const { data: parent } = await supabase
      .from("reels")
      .select("version")
      .eq("id", input.parentReelId)
      .maybeSingle();
    version = (parent?.version ?? 1) + 1;
  }

  const { data: reel, error } = await supabase
    .from("reels")
    .insert({
      owner_id: userId,
      title: (result.title ?? "AI reel").slice(0, 90),
      reel_type: input.mode,
      player_id: input.playerId ?? null,
      game_id: sourceGameIds.length === 1 ? sourceGameIds[0]! : null,
      summary: result.summary ?? null,
      reviewed_clip_count: clips.length,
      version,
      parent_reel_id: input.parentReelId ?? null,
      source_game_ids: sourceGameIds,
      generation_prompt: input.customPrompt ?? null,
      model_version: AI_MODEL,
      metadata: { adjustments: input.adjustments ?? [], ai_generated: true },
    })
    .select("id")
    .single();
  if (error || !reel) throw new Error(error?.message ?? "Could not save the reel.");

  const { error: clipError } = await supabase.from("reel_clips").insert(
    selection.map((entry, index) => ({
      reel_id: reel.id,
      clip_id: entry.id,
      position: index,
      ai_reason: entry.reason,
    })),
  );
  if (clipError) throw new Error(clipError.message);

  return { reelId: reel.id, clipCount: selection.length, reviewedClipCount: clips.length };
}

/* -------------------------------------------------------------------------- */
/* Narrative reports                                                           */
/* -------------------------------------------------------------------------- */

export async function generateGameStory(supabase: Client, userId: string, gameId: string) {
  const clips = await loadReviewClips(supabase, { gameId });
  if (clips.length === 0) throw new Error("Mark some plays first — there is nothing to summarize.");

  const content = await callAiJson<GameStoryContent>(
    "You write concise basketball game stories from a coach's marked plays. You never watch video; describe only what the marked plays show and never imply full-game analysis.",
    `Reviewed plays:\n${serializeClips(clips)}\n\nReturn json {"headline":"...","narrative":"3-5 sentences","counts":[{"label":"Drives","value":4}],"strengths":["..."],"developmentThemes":["..."],"decisionPatterns":["..."],"suggestedPlaylist":{"name":"...","description":"..."}}`,
  );

  return upsertReport(supabase, userId, {
    report_type: "game_story",
    game_id: gameId,
    player_id: clips.find((clip) => clip.playerId)?.playerId ?? null,
    reviewed_clip_count: clips.length,
    content,
  });
}

export async function generateDevelopmentSummary(
  supabase: Client,
  userId: string,
  playerId: string,
) {
  const clips = await loadReviewClips(supabase, { playerId });
  if (clips.length === 0)
    throw new Error("Mark some plays for this athlete first — there is nothing to summarize.");

  const content = await callAiJson<DevelopmentSummaryContent>(
    "You write player-development summaries from a coach's marked plays across games. You never watch video; base everything on the structured review data and never imply full-game analysis.",
    `Reviewed plays across ${new Set(clips.map((clip) => clip.gameId)).size} game(s):\n${serializeClips(clips)}\n\nReturn json {"topStrength":"...","biggestPriority":"...","patternsObserved":["..."],"recommendedFilmReview":["..."],"suggestedWorkoutFocus":["..."],"summary":"3-5 sentences"}`,
  );

  return upsertReport(supabase, userId, {
    report_type: "development_summary",
    game_id: null,
    player_id: playerId,
    reviewed_clip_count: clips.length,
    content,
  });
}

async function upsertReport(
  supabase: Client,
  userId: string,
  row: {
    report_type: string;
    game_id: string | null;
    player_id: string | null;
    reviewed_clip_count: number;
    content: unknown;
  },
) {
  let existing = supabase
    .from("ai_reports")
    .select("id")
    .eq("owner_id", userId)
    .eq("report_type", row.report_type);
  existing = row.game_id ? existing.eq("game_id", row.game_id) : existing.is("game_id", null);
  existing = row.player_id
    ? existing.eq("player_id", row.player_id)
    : existing.is("player_id", null);
  const { data: found } = await existing.maybeSingle();

  const payload = {
    ...row,
    content: row.content as never,
    owner_id: userId,
    model_version: AI_MODEL,
  };

  if (found?.id) {
    const { error } = await supabase.from("ai_reports").update(payload).eq("id", found.id);
    if (error) throw new Error(error.message);
    return { id: found.id, reviewedClipCount: row.reviewed_clip_count };
  }

  const { data: inserted, error } = await supabase
    .from("ai_reports")
    .insert(payload)
    .select("id")
    .single();
  if (error || !inserted) throw new Error(error?.message ?? "Could not save the report.");
  return { id: inserted.id, reviewedClipCount: row.reviewed_clip_count };
}