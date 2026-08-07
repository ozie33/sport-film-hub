-- Players: new optional fields
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS weight text;

-- Reference media type enum
DO $$ BEGIN
  CREATE TYPE public.player_reference_type AS ENUM ('headshot','full_body','practice','game_crop','reference_video','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.external_link_provider AS ENUM ('instagram','youtube','hudl','twitter','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- TEAMS
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_name text,
  team_name text NOT NULL,
  sport_id uuid REFERENCES public.sports(id),
  season text,
  level text,
  coach_name text,
  primary_color text,
  secondary_color text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own teams" ON public.teams
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TRIGGER teams_updated_at BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Ownership helpers
CREATE OR REPLACE FUNCTION public.owns_player(_player_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.players WHERE id = _player_id AND owner_id = auth.uid());
$$;
REVOKE EXECUTE ON FUNCTION public.owns_player(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_player(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_view_player(_player_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.owns_player(_player_id)
      OR EXISTS (
        SELECT 1 FROM public.games g
        JOIN public.game_players gp ON gp.game_id = g.id
        WHERE gp.player_id = _player_id
          AND public.has_resource_share('game', g.id)
      );
$$;
REVOKE EXECUTE ON FUNCTION public.can_view_player(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_player(uuid) TO authenticated, service_role;

-- PLAYER TEAM MEMBERSHIPS
CREATE TABLE IF NOT EXISTS public.player_team_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  jersey_number text,
  position_id uuid REFERENCES public.sport_positions(id),
  position_label text,
  season text,
  start_date date,
  end_date date,
  active boolean NOT NULL DEFAULT true,
  is_current boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS player_team_memberships_player_idx ON public.player_team_memberships(player_id);
CREATE INDEX IF NOT EXISTS player_team_memberships_team_idx ON public.player_team_memberships(team_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_team_memberships TO authenticated;
GRANT ALL ON public.player_team_memberships TO service_role;
ALTER TABLE public.player_team_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage memberships" ON public.player_team_memberships
  FOR ALL TO authenticated USING (public.owns_player(player_id)) WITH CHECK (public.owns_player(player_id));

CREATE POLICY "Shared viewers read memberships" ON public.player_team_memberships
  FOR SELECT TO authenticated USING (public.can_view_player(player_id));

CREATE TRIGGER player_team_memberships_updated_at BEFORE UPDATE ON public.player_team_memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PLAYER REFERENCE MEDIA
CREATE TABLE IF NOT EXISTS public.player_reference_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  reference_type public.player_reference_type NOT NULL DEFAULT 'headshot',
  provider text NOT NULL DEFAULT 'upload',
  file_reference text,
  thumbnail_url text,
  mime_type text,
  notes text,
  source_game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  ai_generated boolean NOT NULL DEFAULT false,
  confidence_score numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by uuid REFERENCES auth.users(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS player_reference_media_player_idx ON public.player_reference_media(player_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_reference_media TO authenticated;
GRANT ALL ON public.player_reference_media TO service_role;
ALTER TABLE public.player_reference_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage reference media" ON public.player_reference_media
  FOR ALL TO authenticated USING (public.owns_player(player_id)) WITH CHECK (public.owns_player(player_id));

CREATE POLICY "Shared viewers read reference media" ON public.player_reference_media
  FOR SELECT TO authenticated USING (public.can_view_player(player_id));

CREATE TRIGGER player_reference_media_updated_at BEFORE UPDATE ON public.player_reference_media
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- EXTERNAL REFERENCE LINKS
CREATE TABLE IF NOT EXISTS public.external_reference_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  provider public.external_link_provider NOT NULL DEFAULT 'other',
  url text NOT NULL,
  label text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS external_reference_links_player_idx ON public.external_reference_links(player_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_reference_links TO authenticated;
GRANT ALL ON public.external_reference_links TO service_role;
ALTER TABLE public.external_reference_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage external links" ON public.external_reference_links
  FOR ALL TO authenticated USING (public.owns_player(player_id)) WITH CHECK (public.owns_player(player_id));

CREATE POLICY "Shared viewers read external links" ON public.external_reference_links
  FOR SELECT TO authenticated USING (public.can_view_player(player_id));

CREATE TRIGGER external_reference_links_updated_at BEFORE UPDATE ON public.external_reference_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- GAME CONTEXT
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS season text,
  ADD COLUMN IF NOT EXISTS jersey_number text,
  ADD COLUMN IF NOT EXISTS position_id uuid REFERENCES public.sport_positions(id),
  ADD COLUMN IF NOT EXISTS uniform_primary_color text,
  ADD COLUMN IF NOT EXISTS uniform_secondary_color text,
  ADD COLUMN IF NOT EXISTS coach_name text;
