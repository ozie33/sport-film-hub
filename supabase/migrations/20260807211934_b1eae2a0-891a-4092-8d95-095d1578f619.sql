CREATE TYPE public.video_provider AS ENUM ('upload','youtube','hudl','external');
CREATE TYPE public.video_ingestion_status AS ENUM ('waiting','uploading','uploaded','processing','ready','failed');
CREATE TYPE public.provider_access_level AS ENUM ('link_only','embed_available','authorized_api','raw_video_available','unsupported');
CREATE TYPE public.provider_connection_status AS ENUM ('not_connected','connected','needs_configuration');

CREATE TABLE public.video_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Main angle',
  source_type text NOT NULL DEFAULT 'external_link',
  provider public.video_provider NOT NULL,
  access_level public.provider_access_level NOT NULL DEFAULT 'unsupported',
  external_video_id text,
  external_url text,
  embed_url text,
  playback_url text,
  storage_path text,
  original_filename text,
  mime_type text,
  file_size bigint,
  duration numeric,
  width integer,
  height integer,
  thumbnail_url text,
  ingestion_status public.video_ingestion_status NOT NULL DEFAULT 'waiting',
  processing_status public.video_ingestion_status NOT NULL DEFAULT 'waiting',
  is_primary boolean NOT NULL DEFAULT false,
  error text,
  provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  rights_confirmed_at timestamp with time zone,
  rights_confirmed_by uuid REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT video_assets_source_type_check CHECK (source_type IN ('file','external_link'))
);
CREATE INDEX video_assets_game_id_idx ON public.video_assets(game_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_assets TO authenticated;
GRANT ALL ON public.video_assets TO service_role;
ALTER TABLE public.video_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own video assets" ON public.video_assets FOR ALL TO authenticated
  USING (public.owns_game(game_id)) WITH CHECK (public.owns_game(game_id));
CREATE TRIGGER video_assets_updated_at BEFORE UPDATE ON public.video_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.video_source_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_asset_id uuid NOT NULL REFERENCES public.video_assets(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  retrieved_from text,
  retrieved_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (video_asset_id, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_source_metadata TO authenticated;
GRANT ALL ON public.video_source_metadata TO service_role;
ALTER TABLE public.video_source_metadata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own video source metadata" ON public.video_source_metadata FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.video_assets va WHERE va.id = video_asset_id AND public.owns_game(va.game_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.video_assets va WHERE va.id = video_asset_id AND public.owns_game(va.game_id)));
CREATE TRIGGER video_source_metadata_updated_at BEFORE UPDATE ON public.video_source_metadata
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.video_provider_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  provider public.video_provider NOT NULL,
  status public.provider_connection_status NOT NULL DEFAULT 'not_connected',
  external_account_id text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  connected_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (owner_id, provider)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_provider_connections TO authenticated;
GRANT ALL ON public.video_provider_connections TO service_role;
ALTER TABLE public.video_provider_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own provider connections" ON public.video_provider_connections FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER video_provider_connections_updated_at BEFORE UPDATE ON public.video_provider_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.clips ADD COLUMN video_asset_id uuid REFERENCES public.video_assets(id) ON DELETE CASCADE;
ALTER TABLE public.events ADD COLUMN video_asset_id uuid REFERENCES public.video_assets(id) ON DELETE SET NULL;
CREATE INDEX clips_video_asset_id_idx ON public.clips(video_asset_id);
CREATE INDEX events_video_asset_id_idx ON public.events(video_asset_id);

INSERT INTO public.event_types (sport_id, key, name, default_side, subtypes, outcomes, sort_order)
SELECT s.id, 'other', 'Other', 'neutral', '[]'::jsonb, '[]'::jsonb, 99
FROM public.sports s WHERE s.key = 'basketball'
ON CONFLICT DO NOTHING;