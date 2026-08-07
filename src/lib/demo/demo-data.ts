/**
 * Demo/preview data only. Never inserted into the database and never written to
 * a real user account. Every surface that renders it must show a demo label.
 */
import type { EventRecord, GameRecord, PlayerRecord } from "@/lib/data/queries";

export const DEMO_SPORT_LABEL = "Basketball";

export type DemoPlayer = PlayerRecord & { position_label: string | null };

export const demoPlayers: DemoPlayer[] = [
  {
    id: "demo-player-1",
    first_name: "Jordan",
    last_name: "Reese",
    image_url: null,
    sport_id: "demo-sport",
    team_name: "Northside Prep",
    jersey_number: "3",
    position_id: null,
    position_label: "Combo Guard",
    height: "6'2\"",
    graduation_year: 2027,
    dominant_hand: "right",
    notes: "Downhill driver, developing pull-up game.",
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-player-2",
    first_name: "Malik",
    last_name: "Turner",
    image_url: null,
    sport_id: "demo-sport",
    team_name: "Northside Prep",
    jersey_number: "22",
    position_id: null,
    position_label: "Wing",
    height: "6'5\"",
    graduation_year: 2026,
    dominant_hand: "left",
    notes: "Defensive disruptor, catch-and-shoot reads improving.",
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-player-3",
    first_name: "Ava",
    last_name: "Sinclair",
    image_url: null,
    sport_id: "demo-sport",
    team_name: "Lakeview Academy",
    jersey_number: "11",
    position_id: null,
    position_label: "Point Guard",
    height: "5'8\"",
    graduation_year: 2028,
    dominant_hand: "both",
    notes: "High-IQ passer out of paint touches.",
    created_at: new Date().toISOString(),
  },
];

function demoGame(
  id: string,
  title: string,
  opponent: string,
  date: string,
  videoStatus: string,
  analysisStatus: string,
  clipCount: number,
  playerIndex: number,
): GameRecord {
  const player = demoPlayers[playerIndex]!;
  return {
    id,
    sport_id: "demo-sport",
    title,
    opponent,
    game_date: date,
    is_home: playerIndex % 2 === 0,
    notes: null,
    video_status: videoStatus,
    analysis_status: analysisStatus,
    clip_count: clipCount,
    created_at: new Date().toISOString(),
    game_players: [
      {
        player_id: player.id,
        is_primary: true,
        players: { first_name: player.first_name, last_name: player.last_name },
      },
    ],
  };
}

export const demoGames: GameRecord[] = [
  demoGame("demo-game-1", "Northside vs Eastview", "Eastview", "2026-07-28", "uploaded", "ready_for_review", 24, 0),
  demoGame("demo-game-2", "Summer Circuit — Game 3", "Metro Elite", "2026-07-19", "uploaded", "reviewed", 31, 1),
  demoGame("demo-game-3", "Northside vs Ridgeway", "Ridgeway", "2026-07-11", "processing", "processing", 0, 0),
  demoGame("demo-game-4", "Lakeview vs Central", "Central", "2026-06-30", "uploaded", "reviewed", 27, 2),
];

export const demoEvents: EventRecord[] = [
  {
    id: "demo-event-1",
    game_id: "demo-game-1",
    player_id: "demo-player-1",
    event_type_key: "drive",
    event_subtype: "Right Hand",
    outcome: "Made Layup",
    possession_type: "Half Court",
    offense_or_defense: "offense",
    start_time: 134,
    end_time: 142,
    tags: ["paint touch", "rim attempt"],
    notes: "Beat the closeout, finished through contact.",
    approved: true,
    source: "manual",
    confidence_score: null,
  },
  {
    id: "demo-event-2",
    game_id: "demo-game-1",
    player_id: "demo-player-1",
    event_type_key: "assist",
    event_subtype: "Kickout Pass",
    outcome: "Made",
    possession_type: "Half Court",
    offense_or_defense: "offense",
    start_time: 291,
    end_time: 299,
    tags: ["drive and kick"],
    notes: "Two-foot stop, found the corner shooter.",
    approved: true,
    source: "manual",
    confidence_score: null,
  },
  {
    id: "demo-event-3",
    game_id: "demo-game-1",
    player_id: "demo-player-1",
    event_type_key: "turnover",
    event_subtype: "Live Ball",
    outcome: "Lost Possession",
    possession_type: "Transition",
    offense_or_defense: "offense",
    start_time: 453,
    end_time: 460,
    tags: ["pace"],
    notes: "Rushed the pass in transition.",
    approved: false,
    source: "manual",
    confidence_score: null,
  },
  {
    id: "demo-event-4",
    game_id: "demo-game-1",
    player_id: "demo-player-1",
    event_type_key: "rebound",
    event_subtype: "Defensive",
    outcome: "Secured",
    possession_type: "Half Court",
    offense_or_defense: "defense",
    start_time: 682,
    end_time: 688,
    tags: ["effort"],
    notes: "Boxed out the bigger forward.",
    approved: true,
    source: "manual",
    confidence_score: null,
  },
  {
    id: "demo-event-5",
    game_id: "demo-game-1",
    player_id: "demo-player-1",
    event_type_key: "shot",
    event_subtype: "Pull-Up 3PT",
    outcome: "Missed",
    possession_type: "Half Court",
    offense_or_defense: "offense",
    start_time: 848,
    end_time: 856,
    tags: ["shot profile"],
    notes: "Good look, slight fade on the release.",
    approved: true,
    source: "manual",
    confidence_score: null,
  },
  {
    id: "demo-event-6",
    game_id: "demo-game-1",
    player_id: "demo-player-1",
    event_type_key: "help_rotation",
    event_subtype: "Weak Side",
    outcome: "Good Rotation",
    possession_type: "Half Court",
    offense_or_defense: "defense",
    start_time: 1125,
    end_time: 1133,
    tags: ["defensive impact"],
    notes: "Early weak-side rotation forced a kickout.",
    approved: true,
    source: "manual",
    confidence_score: null,
  },
];

export type DemoClip = {
  id: string;
  player_name: string;
  category: string;
  game_title: string;
  timestamp: number;
  score: number;
  side: "offense" | "defense";
};

export const demoClips: DemoClip[] = [
  { id: "demo-clip-1", player_name: "Jordan Reese", category: "Drive — Made Layup", game_title: "Northside vs Eastview", timestamp: 134, score: 8.6, side: "offense" },
  { id: "demo-clip-2", player_name: "Jordan Reese", category: "Assist — Kickout Pass", game_title: "Northside vs Eastview", timestamp: 291, score: 9.1, side: "offense" },
  { id: "demo-clip-3", player_name: "Malik Turner", category: "Defense — Help Rotation", game_title: "Summer Circuit — Game 3", timestamp: 612, score: 8.2, side: "defense" },
  { id: "demo-clip-4", player_name: "Jordan Reese", category: "Turnover — Live Ball", game_title: "Northside vs Eastview", timestamp: 453, score: 4.1, side: "offense" },
  { id: "demo-clip-5", player_name: "Ava Sinclair", category: "Paint Touch — Pass Out", game_title: "Lakeview vs Central", timestamp: 205, score: 8.9, side: "offense" },
  { id: "demo-clip-6", player_name: "Malik Turner", category: "Shot — Catch-and-Shoot 3PT", game_title: "Summer Circuit — Game 3", timestamp: 741, score: 7.4, side: "offense" },
];

export const demoSnapshot = [
  { label: "Games Analyzed", value: "4" },
  { label: "Clips Reviewed", value: "82" },
  { label: "Positive Decisions", value: "64%" },
  { label: "Paint Touches", value: "18" },
  { label: "Turnovers", value: "7" },
];

export type FilmRoomPlaylist = {
  system_key: string;
  name: string;
  clip_count: number;
  duration_seconds: number;
  player_name: string;
  game_title: string;
  side: "offense" | "defense" | "all";
};

export const demoPlaylists: FilmRoomPlaylist[] = [
  { system_key: "all_player_clips", name: "All Player Clips", clip_count: 24, duration_seconds: 384, player_name: "Jordan Reese", game_title: "Northside vs Eastview", side: "all" },
  { system_key: "all_touches", name: "All Touches", clip_count: 41, duration_seconds: 512, player_name: "Jordan Reese", game_title: "Northside vs Eastview", side: "offense" },
  { system_key: "shot_attempts", name: "Shot Attempts", clip_count: 12, duration_seconds: 168, player_name: "Jordan Reese", game_title: "Northside vs Eastview", side: "offense" },
  { system_key: "makes", name: "Makes", clip_count: 7, duration_seconds: 96, player_name: "Jordan Reese", game_title: "Northside vs Eastview", side: "offense" },
  { system_key: "misses", name: "Misses", clip_count: 5, duration_seconds: 72, player_name: "Jordan Reese", game_title: "Northside vs Eastview", side: "offense" },
  { system_key: "drives", name: "Drives", clip_count: 9, duration_seconds: 141, player_name: "Jordan Reese", game_title: "Northside vs Eastview", side: "offense" },
  { system_key: "assists", name: "Assists", clip_count: 6, duration_seconds: 84, player_name: "Jordan Reese", game_title: "Northside vs Eastview", side: "offense" },
  { system_key: "turnovers", name: "Turnovers", clip_count: 2, duration_seconds: 28, player_name: "Jordan Reese", game_title: "Northside vs Eastview", side: "offense" },
  { system_key: "defense", name: "Defense", clip_count: 14, duration_seconds: 210, player_name: "Jordan Reese", game_title: "Northside vs Eastview", side: "defense" },
  { system_key: "rebounds", name: "Rebounds", clip_count: 8, duration_seconds: 112, player_name: "Jordan Reese", game_title: "Northside vs Eastview", side: "defense" },
  { system_key: "positive_decisions", name: "Positive Decisions", clip_count: 16, duration_seconds: 246, player_name: "Jordan Reese", game_title: "Northside vs Eastview", side: "all" },
  { system_key: "development_opportunities", name: "Development Opportunities", clip_count: 6, duration_seconds: 92, player_name: "Jordan Reese", game_title: "Northside vs Eastview", side: "all" },
];

export const demoDevelopment = {
  gameStory: [
    { label: "Offensive possessions analyzed", value: "42" },
    { label: "Paint touches", value: "7" },
    { label: "Rim attempts", value: "4" },
    { label: "Catch-and-shoot opportunities", value: "6" },
    { label: "Shots passed up", value: "3" },
    { label: "Potential assists", value: "5" },
    { label: "Turnovers", value: "2" },
    { label: "Defensive disruptions", value: "6" },
  ],
  biggestStrength: "Downhill attacks consistently forced help rotation.",
  biggestOpportunity: "Player became less aggressive after turnovers.",
  recommendedFocus:
    "Re-attack mentality, contact finishing, and decision-making out of paint touches.",
  decisionQuality: [
    { label: "Positive decisions", value: 64 },
    { label: "Neutral decisions", value: 23 },
    { label: "Negative decisions", value: 13 },
  ],
  shotProfile: [
    { label: "Rim", value: 41 },
    { label: "Mid-range", value: 22 },
    { label: "Three", value: 37 },
  ],
  workouts: [
    "Contact finishing series — 3 sets of 8 each hand",
    "Re-attack decision ladder — 12 reps off live-ball mistakes",
    "Paint-touch read drill — kickout vs. finish, 20 reps",
    "Weak-side rotation closeout circuit — 4 rounds",
  ],
};
