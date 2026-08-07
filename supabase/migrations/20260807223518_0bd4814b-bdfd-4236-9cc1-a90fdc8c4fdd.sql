-- 1. Google Drive becomes a first-class provider
ALTER TYPE public.video_provider ADD VALUE IF NOT EXISTS 'google_drive';

-- 2. Sharing + storage-strategy enums
DO $$ BEGIN
  CREATE TYPE public.shared_resource_type AS ENUM ('game','playlist','film_review','reel','development_report');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.share_permission AS ENUM ('view','comment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.share_status AS ENUM ('pending','active','revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.source_permission_state AS ENUM ('unknown','owner','shared','no_access','not_applicable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cleanup_state AS ENUM ('not_required','pending','in_progress','done','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Source-of-truth + temporary-storage fields on video assets
ALTER TABLE public.video_assets
  ADD COLUMN IF NOT EXISTS provider_connection_id uuid REFERENCES public.video_provider_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS permissions_status public.source_permission_state NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS is_temporary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS cleanup_status public.cleanup_state NOT NULL DEFAULT 'not_required';

UPDATE public.video_assets SET permissions_status = 'owner'
  WHERE permissions_status = 'unknown' AND provider = 'upload';
UPDATE public.video_assets SET permissions_status = 'not_applicable'
  WHERE permissions_status = 'unknown' AND provider IN ('youtube','hudl','external');

-- 4. Server-only encrypted app-user connector keys
CREATE TABLE IF NOT EXISTS public.app_user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connector_id text NOT NULL,
  connection_key_ciphertext text NOT NULL,
  account_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connector_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_user_connections TO service_role;
ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS app_user_connections_updated_at ON public.app_user_connections;
CREATE TRIGGER app_user_connections_updated_at BEFORE UPDATE ON public.app_user_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Reusable sharing model
CREATE TABLE IF NOT EXISTS public.shared_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type public.shared_resource_type NOT NULL,
  resource_id uuid NOT NULL,
  shared_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_email text,
  permission public.share_permission NOT NULL DEFAULT 'view',
  status public.share_status NOT NULL DEFAULT 'active',
  source_access_state public.source_permission_state NOT NULL DEFAULT 'unknown',
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  viewed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS shared_resources_unique_target
  ON public.shared_resources (resource_type, resource_id, shared_with_user_id)
  WHERE shared_with_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS shared_resources_recipient_idx
  ON public.shared_resources (shared_with_user_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_resources TO authenticated;
GRANT ALL ON public.shared_resources TO service_role;
ALTER TABLE public.shared_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sharers manage their shares" ON public.shared_resources;
CREATE POLICY "Sharers manage their shares" ON public.shared_resources
  FOR ALL TO authenticated
  USING (shared_by_user_id = auth.uid())
  WITH CHECK (shared_by_user_id = auth.uid());

DROP POLICY IF EXISTS "Recipients read their shares" ON public.shared_resources;
CREATE POLICY "Recipients read their shares" ON public.shared_resources
  FOR SELECT TO authenticated
  USING (shared_with_user_id = auth.uid());

DROP POLICY IF EXISTS "Recipients acknowledge their shares" ON public.shared_resources;
CREATE POLICY "Recipients acknowledge their shares" ON public.shared_resources
  FOR UPDATE TO authenticated
  USING (shared_with_user_id = auth.uid())
  WITH CHECK (shared_with_user_id = auth.uid());

DROP TRIGGER IF EXISTS shared_resources_updated_at ON public.shared_resources;
CREATE TRIGGER shared_resources_updated_at BEFORE UPDATE ON public.shared_resources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Share-aware read helpers
CREATE OR REPLACE FUNCTION public.has_resource_share(_type public.shared_resource_type, _id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shared_resources
    WHERE resource_type = _type
      AND resource_id = _id
      AND shared_with_user_id = auth.uid()
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_playlist(_playlist_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.owns_playlist(_playlist_id)
      OR public.has_resource_share('playlist', _playlist_id)
      OR public.has_resource_share('film_review', _playlist_id)
      OR public.has_resource_share('reel', _playlist_id);
$$;

CREATE OR REPLACE FUNCTION public.can_view_game(_game_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.owns_game(_game_id)
      OR public.has_resource_share('game', _game_id)
      OR EXISTS (
        SELECT 1
        FROM public.playlist_clips pc
        JOIN public.clips c ON c.id = pc.clip_id
        WHERE c.game_id = _game_id
          AND public.can_view_playlist(pc.playlist_id)
      );
$$;

CREATE OR REPLACE FUNCTION public.can_view_clip(_clip_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clips c
    WHERE c.id = _clip_id AND public.can_view_game(c.game_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.shares_identity_with(_other_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shared_resources
    WHERE (shared_by_user_id = auth.uid() AND shared_with_user_id = _other_user_id)
       OR (shared_with_user_id = auth.uid() AND shared_by_user_id = _other_user_id)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_resource_share(public.shared_resource_type, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_view_playlist(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_view_game(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_view_clip(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.shares_identity_with(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_resource_share(public.shared_resource_type, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_playlist(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_game(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_clip(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shares_identity_with(uuid) TO authenticated, service_role;

-- 7. Read-only access for share recipients
DROP POLICY IF EXISTS "Shared viewers read games" ON public.games;
CREATE POLICY "Shared viewers read games" ON public.games
  FOR SELECT TO authenticated USING (public.can_view_game(id));

DROP POLICY IF EXISTS "Shared viewers read video assets" ON public.video_assets;
CREATE POLICY "Shared viewers read video assets" ON public.video_assets
  FOR SELECT TO authenticated USING (public.can_view_game(game_id));

DROP POLICY IF EXISTS "Shared viewers read clips" ON public.clips;
CREATE POLICY "Shared viewers read clips" ON public.clips
  FOR SELECT TO authenticated USING (public.can_view_game(game_id));

DROP POLICY IF EXISTS "Shared viewers read events" ON public.events;
CREATE POLICY "Shared viewers read events" ON public.events
  FOR SELECT TO authenticated USING (public.can_view_game(game_id));

DROP POLICY IF EXISTS "Shared viewers read playlists" ON public.playlists;
CREATE POLICY "Shared viewers read playlists" ON public.playlists
  FOR SELECT TO authenticated USING (public.can_view_playlist(id));

DROP POLICY IF EXISTS "Shared viewers read playlist clips" ON public.playlist_clips;
CREATE POLICY "Shared viewers read playlist clips" ON public.playlist_clips
  FOR SELECT TO authenticated USING (public.can_view_playlist(playlist_id));

DROP POLICY IF EXISTS "Shared viewers read players" ON public.players;
CREATE POLICY "Shared viewers read players" ON public.players
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.clips c
      WHERE c.player_id = players.id AND public.can_view_game(c.game_id)
    )
  );

DROP POLICY IF EXISTS "Counterparties read basic profile" ON public.profiles;
CREATE POLICY "Counterparties read basic profile" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid() OR public.shares_identity_with(id));