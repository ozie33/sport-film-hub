-- ENUMS
CREATE TYPE public.app_role AS ENUM ('athlete','parent','coach','trainer','admin');
CREATE TYPE public.workflow_status AS ENUM ('upload_pending','uploaded','processing','ready_for_review','reviewed','error');
CREATE TYPE public.data_source AS ENUM ('manual','ai','ai_corrected');
CREATE TYPE public.play_side AS ENUM ('offense','defense','neutral','special');

-- SHARED TRIGGER
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

-- SPORT CATALOG
CREATE TABLE public.sports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sports TO authenticated, anon;
GRANT ALL ON public.sports TO service_role;
ALTER TABLE public.sports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sports readable" ON public.sports FOR SELECT TO authenticated, anon USING (true);

CREATE TABLE public.sport_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id uuid NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  abbreviation text,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (sport_id, key)
);
GRANT SELECT ON public.sport_positions TO authenticated, anon;
GRANT ALL ON public.sport_positions TO service_role;
ALTER TABLE public.sport_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "positions readable" ON public.sport_positions FOR SELECT TO authenticated, anon USING (true);

CREATE TABLE public.event_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id uuid NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  default_side public.play_side NOT NULL DEFAULT 'neutral',
  subtypes jsonb NOT NULL DEFAULT '[]'::jsonb,
  outcomes jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (sport_id, key)
);
GRANT SELECT ON public.event_types TO authenticated, anon;
GRANT ALL ON public.event_types TO service_role;
ALTER TABLE public.event_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event types readable" ON public.event_types FOR SELECT TO authenticated, anon USING (true);

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  avatar_url text,
  primary_role public.app_role,
  primary_sport_id uuid REFERENCES public.sports(id) ON DELETE SET NULL,
  position_id uuid REFERENCES public.sport_positions(id) ON DELETE SET NULL,
  organization_name text,
  onboarding_completed boolean NOT NULL DEFAULT false,
  demo_mode boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'first_name', NEW.raw_user_meta_data->>'last_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- PLAYERS
CREATE TABLE public.players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  image_url text,
  sport_id uuid NOT NULL REFERENCES public.sports(id),
  team_name text,
  jersey_number text,
  position_id uuid REFERENCES public.sport_positions(id) ON DELETE SET NULL,
  height text,
  graduation_year integer,
  dominant_hand text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.players TO authenticated;
GRANT ALL ON public.players TO service_role;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own players" ON public.players FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER players_updated_at BEFORE UPDATE ON public.players FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- GAMES
CREATE TABLE public.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  sport_id uuid NOT NULL REFERENCES public.sports(id),
  title text NOT NULL,
  opponent text,
  game_date date,
  is_home boolean,
  notes text,
  video_status public.workflow_status NOT NULL DEFAULT 'upload_pending',
  analysis_status public.workflow_status NOT NULL DEFAULT 'upload_pending',
  clip_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.games TO authenticated;
GRANT ALL ON public.games TO service_role;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own games" ON public.games FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER games_updated_at BEFORE UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.owns_game(_game_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.games WHERE id = _game_id AND owner_id = auth.uid());
$$;

CREATE TABLE public.game_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, player_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_players TO authenticated;
GRANT ALL ON public.game_players TO service_role;
ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own game players" ON public.game_players FOR ALL TO authenticated USING (public.owns_game(game_id)) WITH CHECK (public.owns_game(game_id));

CREATE TABLE public.game_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Main angle',
  provider text,
  source_ref text,
  duration_seconds numeric,
  offset_seconds numeric NOT NULL DEFAULT 0,
  status public.workflow_status NOT NULL DEFAULT 'upload_pending',
  is_primary boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_videos TO authenticated;
GRANT ALL ON public.game_videos TO service_role;
ALTER TABLE public.game_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own game videos" ON public.game_videos FOR ALL TO authenticated USING (public.owns_game(game_id)) WITH CHECK (public.owns_game(game_id));
CREATE TRIGGER game_videos_updated_at BEFORE UPDATE ON public.game_videos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- EVENTS
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  sport_id uuid NOT NULL REFERENCES public.sports(id),
  video_id uuid REFERENCES public.game_videos(id) ON DELETE SET NULL,
  event_type_id uuid REFERENCES public.event_types(id) ON DELETE SET NULL,
  event_type_key text,
  event_subtype text,
  possession_type text,
  outcome text,
  offense_or_defense public.play_side NOT NULL DEFAULT 'neutral',
  start_time numeric NOT NULL,
  end_time numeric,
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  approved boolean NOT NULL DEFAULT false,
  manually_edited boolean NOT NULL DEFAULT false,
  source public.data_source NOT NULL DEFAULT 'manual',
  model_version text,
  confidence_score numeric,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_game_idx ON public.events (game_id, start_time);
CREATE INDEX events_player_idx ON public.events (player_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own events" ON public.events FOR ALL TO authenticated USING (public.owns_game(game_id)) WITH CHECK (public.owns_game(game_id));
CREATE TRIGGER events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- CLIPS
CREATE TABLE public.clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  video_id uuid REFERENCES public.game_videos(id) ON DELETE SET NULL,
  title text,
  category text,
  start_time numeric NOT NULL,
  end_time numeric,
  thumbnail_url text,
  asset_url text,
  status public.workflow_status NOT NULL DEFAULT 'upload_pending',
  approved boolean NOT NULL DEFAULT false,
  manually_edited boolean NOT NULL DEFAULT false,
  source public.data_source NOT NULL DEFAULT 'manual',
  model_version text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clips_game_idx ON public.clips (game_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clips TO authenticated;
GRANT ALL ON public.clips TO service_role;
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own clips" ON public.clips FOR ALL TO authenticated USING (public.owns_game(game_id)) WITH CHECK (public.owns_game(game_id));
CREATE TRIGGER clips_updated_at BEFORE UPDATE ON public.clips FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- EVALUATIONS
CREATE TABLE public.evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  clip_id uuid REFERENCES public.clips(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  decision_score numeric,
  outcome_score numeric,
  impact_score numeric,
  overall_score numeric,
  confidence_score numeric,
  notes text,
  source public.data_source NOT NULL DEFAULT 'manual',
  model_version text,
  manually_edited boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evaluations TO authenticated;
GRANT ALL ON public.evaluations TO service_role;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own evaluations" ON public.evaluations FOR ALL TO authenticated USING (public.owns_game(game_id)) WITH CHECK (public.owns_game(game_id));
CREATE TRIGGER evaluations_updated_at BEFORE UPDATE ON public.evaluations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PLAYLISTS
CREATE TABLE public.playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  sport_id uuid REFERENCES public.sports(id) ON DELETE SET NULL,
  game_id uuid REFERENCES public.games(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  system_key text,
  is_system boolean NOT NULL DEFAULT false,
  filter_definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlists TO authenticated;
GRANT ALL ON public.playlists TO service_role;
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own playlists" ON public.playlists FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER playlists_updated_at BEFORE UPDATE ON public.playlists FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.owns_playlist(_playlist_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.playlists WHERE id = _playlist_id AND owner_id = auth.uid());
$$;

CREATE TABLE public.playlist_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  clip_id uuid NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (playlist_id, clip_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlist_clips TO authenticated;
GRANT ALL ON public.playlist_clips TO service_role;
ALTER TABLE public.playlist_clips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own playlist clips" ON public.playlist_clips FOR ALL TO authenticated USING (public.owns_playlist(playlist_id)) WITH CHECK (public.owns_playlist(playlist_id));

-- PROCESSING JOBS (future external analysis service)
CREATE TABLE public.processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid REFERENCES public.games(id) ON DELETE CASCADE,
  video_id uuid REFERENCES public.game_videos(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  status public.workflow_status NOT NULL DEFAULT 'upload_pending',
  progress numeric NOT NULL DEFAULT 0,
  error text,
  model_version text,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.processing_jobs TO authenticated;
GRANT ALL ON public.processing_jobs TO service_role;
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own jobs read" ON public.processing_jobs FOR SELECT TO authenticated USING (public.owns_game(game_id));
CREATE POLICY "own jobs insert" ON public.processing_jobs FOR INSERT TO authenticated WITH CHECK (public.owns_game(game_id));
CREATE TRIGGER processing_jobs_updated_at BEFORE UPDATE ON public.processing_jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- SEED: BASKETBALL
INSERT INTO public.sports (key, name, sort_order) VALUES ('basketball','Basketball',1);

INSERT INTO public.sport_positions (sport_id, key, name, abbreviation, sort_order)
SELECT s.id, v.key, v.name, v.abbr, v.ord FROM public.sports s,
(VALUES
  ('point_guard','Point Guard','PG',1),
  ('shooting_guard','Shooting Guard','SG',2),
  ('small_forward','Small Forward','SF',3),
  ('power_forward','Power Forward','PF',4),
  ('center','Center','C',5),
  ('combo_guard','Combo Guard','CG',6),
  ('wing','Wing','W',7),
  ('forward','Forward','F',8),
  ('big','Big','B',9)
) AS v(key,name,abbr,ord)
WHERE s.key = 'basketball';

INSERT INTO public.event_types (sport_id, key, name, default_side, subtypes, outcomes, sort_order)
SELECT s.id, v.key, v.name, v.side::public.play_side, v.subtypes::jsonb, v.outcomes::jsonb, v.ord FROM public.sports s,
(VALUES
  ('shot','Shot','offense','["Layup","Floater","Mid-Range","Catch-and-Shoot 3PT","Pull-Up 3PT","Free Throw"]','["Made","Missed","Fouled"]',1),
  ('drive','Drive','offense','["Right Hand","Left Hand","Baseline","Middle"]','["Made Layup","Missed Layup","Pass Out","Turnover","Foul Drawn"]',2),
  ('assist','Assist','offense','["Kickout Pass","Drive-and-Kick","Pick-and-Roll","Post Feed","Transition"]','["Made"]',3),
  ('potential_assist','Potential Assist','offense','["Kickout Pass","Drive-and-Kick","Extra Pass"]','["Missed Shot"]',4),
  ('rebound','Rebound','neutral','["Offensive","Defensive"]','["Secured","Tipped","Lost"]',5),
  ('turnover','Turnover','offense','["Live Ball","Dead Ball","Bad Pass","Travel","Offensive Foul"]','["Lost Possession"]',6),
  ('steal','Steal','defense','["On-Ball","Passing Lane","Dig"]','["Secured","Deflected Out"]',7),
  ('block','Block','defense','["At Rim","Perimeter","Weak Side"]','["Recovered","Out of Bounds"]',8),
  ('deflection','Deflection','defense','["Passing Lane","On-Ball"]','["Recovered","Lost"]',9),
  ('paint_touch','Paint Touch','offense','["Drive","Post Up","Cut","Offensive Rebound"]','["Shot","Pass Out","Turnover"]',10),
  ('screen','Screen','offense','["Ball Screen","Off-Ball Screen","Slip","Re-Screen"]','["Advantage Created","No Advantage"]',11),
  ('closeout','Closeout','defense','["Contest","Late","Blow-By"]','["Good","Poor"]',12),
  ('help_rotation','Help Rotation','defense','["Gap Help","Weak Side","Tag the Roller"]','["Good Rotation","Late Rotation"]',13),
  ('transition','Transition','neutral','["Push","Sprint Back","Outlet"]','["Score","No Score"]',14),
  ('loose_ball','Loose Ball','neutral','["Floor Dive","Tip Battle"]','["Recovered","Lost"]',15)
) AS v(key,name,side,subtypes,outcomes,ord)
WHERE s.key = 'basketball';