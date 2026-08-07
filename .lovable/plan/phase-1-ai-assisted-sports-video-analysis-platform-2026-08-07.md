# Phase 1: AI-Assisted Sports Video Analysis Platform

Foundation build: auth + onboarding, sport-agnostic database, sidebar app shell, and all Phase 1 screens with clearly-labeled demo data. No computer vision, uploads, AI, or exports.

## What gets built

### Backend (Lovable Cloud)
Relational schema, sport-agnostic by design:

- `sports` — seeded with Basketball (Phase 1) so soccer/football/etc. drop in later
- `event_types` — per-sport event taxonomy (Shot, Drive, Assist, Potential Assist, Rebound, Turnover, Steal, Block, Deflection, Paint Touch, Screen, Closeout, Help Rotation, Transition, Loose Ball), with optional subtypes; the app reads this table instead of hard-coding basketball
- `sport_positions` — per-sport positions (basketball: PG, SG, SF, PF, C, Combo Guard, Wing, Forward, Big)
- `profiles` — first/last name, primary role (athlete/parent/coach/trainer/admin), primary sport, position, org/team name, onboarding_completed
- `user_roles` + `app_role` enum — roles kept in their own table for safe permissioning later
- `players` — name, image, sport, team, jersey, position, height, grad year, dominant hand, notes, owner
- `games` — sport, title, opponent, date, home/away, notes, video_status, analysis_status, clip_count, created_by
- `game_players` — join table (a game can feature multiple players)
- `events` — universal fields only: game, player, sport, start/end time, event_type, event_subtype, possession_type, outcome, offense_or_defense, tags, notes, approved, manually_edited, plus a `metadata` JSONB column for sport-specific detail
- `clips` — derived from events, holds render/asset state for later phases
- `evaluations` — decision/outcome/impact/overall/confidence scores, tied to event
- `playlists` + `playlist_clips` — film-room collections, with a `system_key` so auto-generated collections (Makes, Drives, Turnovers...) are data, not code
- `game_videos` — one game can have many videos/camera angles (angle label, provider, source ref, duration, status, time offset for syncing angles). No upload in Phase 1; the table and models exist so upload drops in cleanly.

Provenance is first-class on `events`, `clips`, and `evaluations`: `source` enum (`manual` | `ai` | `ai_corrected`), `created_by` (null for machine-generated rows), `model_version`, `confidence_score`, `manually_edited`, and `reviewed_by`/`reviewed_at`. AI output is therefore always distinguishable from human input, and a human correction never erases the original machine values.

External-service readiness: a future Python/CV service writes into the same tables using the service role — `game_videos` gives it the media to process, `events`/`clips` carry `source = 'ai'` + `model_version` + timing, and `metadata` JSONB absorbs any sport- or model-specific detail. A `processing_jobs` table (job type, target game/video, status, error, timestamps) gives that service a place to report progress without a schema change.

Reserved for later without migration pain: `teams`, `organizations`, `comments`, `workouts`, `subscriptions`.

RLS on everything, scoped to the owning user. Enums for statuses (Upload Pending, Uploaded, Processing, Ready for Review, Reviewed, Error).

Universal tables stay sport-neutral: no basketball columns anywhere. Positions, event types/subtypes, and outcome vocabularies live in per-sport lookup tables; anything genuinely sport-specific goes in `metadata` JSONB. `game_players` already makes multi-player games a schema fact, not a later migration.

### Shared data models and components
Typed models and query/mutation hooks per entity in `src/lib/models/` (one source of truth for shapes, status enums, and label maps), consumed by every screen. UI is built from a reusable kit — `PageHeader`, `DataTable`, `StatusBadge`, `EntityCard`, `EmptyState`, `StatCard`, `VideoPlaceholder`, `ClipList`/`ClipCard`, `TabbedDetailLayout`, `EntityFormDialog`, `DemoBadge` — rather than one-off components per page.

### Auth
Sign up, login, logout, forgot password + `/reset-password` page, profile page. Email/password and Google sign-in. Post-signup onboarding wizard collecting first/last name, role, primary sport, position (shown only when the sport defines positions), and optional team name.

### App shell
Collapsible left sidebar on desktop, sheet-based nav on mobile: Dashboard, Games, Players, Film Room, Development, Reels, Settings. All app pages live behind the auth gate; a public landing page sits at `/`.

### Screens
- **Dashboard** — "Welcome back, [First name]", primary "Analyze New Game" CTA, Recent Games cards, Player Development Snapshot (with a disclaimer that metrics unlock after analysis), Recent Player Clips cards.
- **Games** — searchable/filterable table with all listed fields and status badges; "Add Game" modal (sport, title, opponent, date, player, home/away, notes) writing a real row with status Upload Pending. No video upload.
- **Players** — grid of player cards, create/edit form with every listed field; player detail page with Overview / Games / Clips / Development tabs.
- **Game detail** — header with title, opponent, date, player, status; large video placeholder; event timeline beside/below it; tabs All Clips / Offense / Defense / Development / Notes. Selecting an event shows its clip detail panel.
- **Film Room** — the 12 playlist cards, each showing clip count, duration, player, game; video placeholder with clip queue and non-functional speed controls (0.5x–3x).
- **Development** — demo dashboard: Game Story counts, Biggest Strength, Biggest Development Opportunity, Recommended Focus, plus placeholders for Decision Quality, Shot Profile, Paint Touches, Turnover Analysis, Defensive Impact, Recommended Workouts.
- **Reels** — placeholder Reel Builder explaining the future flow (select approved clips, reorder, intro, text overlays, export).
- **Settings** — profile and account basics.

### Demo data vs. real accounts
A brand-new account is genuinely empty and shows the empty state: "Your Film Room is empty." / "Upload your first game to begin building your player-development library." with an "Analyze Your First Game" CTA.

Demo content is never written to a user's account. Instead a **"Preview with demo data"** toggle (stored per-user as a preference) swaps in in-memory mock games, players, clips, and development metrics, with a visible "Demo data" badge on every affected surface. Toggling off returns the account to its real, empty state.

### Design
Dark sports-performance aesthetic: deep neutral surfaces, one confident accent for status/CTA, restrained type, data-dense cards over decorative gradients. All colors as semantic tokens in `src/styles.css`, no hardcoded utilities. Fully responsive down to mobile.

## Technical notes
- TanStack Start file routes: public `/`, `/auth`, `/reset-password`; app pages under `_authenticated/`.
- All data access via `createServerFn` with the auth middleware; sport/event taxonomy fetched from the DB and cached with TanStack Query.
- Sport-specific logic isolated in a small `src/lib/sports/` registry (labels, position lists, event grouping) driven by DB rows, so adding a sport is data + one registry entry.
- Mock/demo data lives in `src/lib/demo/` and never touches the database.
- Per-route `head()` metadata on every public/content route.
