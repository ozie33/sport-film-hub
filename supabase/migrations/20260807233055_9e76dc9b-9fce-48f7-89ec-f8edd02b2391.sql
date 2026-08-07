CREATE TYPE public.analysis_job_status AS ENUM (
  'not_started','queued','preparing_video','identifying_player','tracking_player',
  'generating_candidates','ready_for_review','needs_confirmation','failed','cancelled','completed'
);

CREATE TYPE public.candidate_review_status AS ENUM ('pending','approved','rejected','edited');

CREATE TYPE public.identity_confirmation_source AS ENUM ('user_confirmation','user_correction','ai_suggestion');

-- ============================ analysis_jobs ============================
CREATE TABLE public.analysis_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  video_asset_id uuid REFERENCES public.video_assets(id) ON DELETE SET NULL,
  player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  sport_id uuid REFERENCES public.sports(id),
  analysis_type text NOT NULL DEFAULT 'player_identification_tracking',
  status public.analysis_job_status NOT NULL DEFAULT 'not_started',
  progress_percent numeric NOT NULL DEFAULT 0,
  current_stage text,
  provider text NOT NULL DEFAULT 'mock',
  is_demo boolean NOT NULL DEFAULT false,
  external_job_id text,
  model_version text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  identity_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by uuid REFERENCES auth.users(id),
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX analysis_jobs_game_idx ON public.analysis_jobs(game_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.analysis_jobs TO authenticated;
GRANT ALL ON public.analysis_jobs TO service_role;
ALTER TABLE public.analysis_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View analysis for viewable games" ON public.analysis_jobs
  FOR SELECT TO authenticated USING (public.can_view_game(game_id));
CREATE POLICY "Owners create analysis" ON public.analysis_jobs
  FOR INSERT TO authenticated WITH CHECK (public.owns_game(game_id) AND requested_by = auth.uid());
CREATE POLICY "Owners update analysis" ON public.analysis_jobs
  FOR UPDATE TO authenticated USING (public.owns_game(game_id));
CREATE POLICY "Owners delete analysis" ON public.analysis_jobs
  FOR DELETE TO authenticated USING (public.owns_game(game_id));

CREATE TRIGGER analysis_jobs_updated_at BEFORE UPDATE ON public.analysis_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==================== player_identity_confirmations ====================
CREATE TABLE public.player_identity_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  video_asset_id uuid REFERENCES public.video_assets(id) ON DELETE SET NULL,
  analysis_job_id uuid REFERENCES public.analysis_jobs(id) ON DELETE SET NULL,
  candidate_clip_id uuid,
  timestamp_seconds numeric NOT NULL,
  bounding_box jsonb NOT NULL DEFAULT '{}'::jsonb,
  frame_image_path text,
  source public.identity_confirmation_source NOT NULL DEFAULT 'user_confirmation',
  confidence numeric NOT NULL DEFAULT 1.0,
  saved_to_reference_id uuid REFERENCES public.player_reference_media(id) ON DELETE SET NULL,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX identity_confirmations_game_idx ON public.player_identity_confirmations(game_id, player_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_identity_confirmations TO authenticated;
GRANT ALL ON public.player_identity_confirmations TO service_role;
ALTER TABLE public.player_identity_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View confirmations for viewable games" ON public.player_identity_confirmations
  FOR SELECT TO authenticated USING (public.can_view_game(game_id));
CREATE POLICY "Owners create confirmations" ON public.player_identity_confirmations
  FOR INSERT TO authenticated WITH CHECK (public.owns_game(game_id));
CREATE POLICY "Owners update confirmations" ON public.player_identity_confirmations
  FOR UPDATE TO authenticated USING (public.owns_game(game_id));
CREATE POLICY "Owners delete confirmations" ON public.player_identity_confirmations
  FOR DELETE TO authenticated USING (public.owns_game(game_id));

CREATE TRIGGER identity_confirmations_updated_at BEFORE UPDATE ON public.player_identity_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================ player_tracks ============================
CREATE TABLE public.player_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_job_id uuid NOT NULL REFERENCES public.analysis_jobs(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  video_asset_id uuid REFERENCES public.video_assets(id) ON DELETE SET NULL,
  track_id text NOT NULL,
  start_time numeric NOT NULL,
  end_time numeric NOT NULL,
  average_confidence numeric,
  identity_confidence numeric,
  tracking_confidence numeric,
  needs_confirmation boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX player_tracks_job_idx ON public.player_tracks(analysis_job_id, start_time);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_tracks TO authenticated;
GRANT ALL ON public.player_tracks TO service_role;
ALTER TABLE public.player_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View tracks for viewable games" ON public.player_tracks
  FOR SELECT TO authenticated USING (public.can_view_game(game_id));
CREATE POLICY "Owners create tracks" ON public.player_tracks
  FOR INSERT TO authenticated WITH CHECK (public.owns_game(game_id));
CREATE POLICY "Owners update tracks" ON public.player_tracks
  FOR UPDATE TO authenticated USING (public.owns_game(game_id));
CREATE POLICY "Owners delete tracks" ON public.player_tracks
  FOR DELETE TO authenticated USING (public.owns_game(game_id));

CREATE TRIGGER player_tracks_updated_at BEFORE UPDATE ON public.player_tracks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================== candidate_clips ===========================
CREATE TABLE public.candidate_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_job_id uuid NOT NULL REFERENCES public.analysis_jobs(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  video_asset_id uuid REFERENCES public.video_assets(id) ON DELETE SET NULL,
  player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  track_id uuid REFERENCES public.player_tracks(id) ON DELETE SET NULL,
  sequence_number integer NOT NULL DEFAULT 1,
  start_time numeric NOT NULL,
  end_time numeric NOT NULL,
  ai_confidence numeric,
  candidate_reason text,
  ai_prediction jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_status public.candidate_review_status NOT NULL DEFAULT 'pending',
  original_start_time numeric NOT NULL,
  original_end_time numeric NOT NULL,
  original_player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  corrected_player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  wrong_player boolean NOT NULL DEFAULT false,
  user_decision text,
  correction_notes text,
  tags text[] NOT NULL DEFAULT '{}',
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  clip_id uuid REFERENCES public.clips(id) ON DELETE SET NULL,
  is_demo boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX candidate_clips_job_idx ON public.candidate_clips(analysis_job_id, sequence_number);
CREATE INDEX candidate_clips_game_idx ON public.candidate_clips(game_id, review_status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_clips TO authenticated;
GRANT ALL ON public.candidate_clips TO service_role;
ALTER TABLE public.candidate_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View candidates for viewable games" ON public.candidate_clips
  FOR SELECT TO authenticated USING (public.can_view_game(game_id));
CREATE POLICY "Owners create candidates" ON public.candidate_clips
  FOR INSERT TO authenticated WITH CHECK (public.owns_game(game_id));
CREATE POLICY "Owners update candidates" ON public.candidate_clips
  FOR UPDATE TO authenticated USING (public.owns_game(game_id));
CREATE POLICY "Owners delete candidates" ON public.candidate_clips
  FOR DELETE TO authenticated USING (public.owns_game(game_id));

CREATE TRIGGER candidate_clips_updated_at BEFORE UPDATE ON public.candidate_clips
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.player_identity_confirmations
  ADD CONSTRAINT identity_confirmations_candidate_fk
  FOREIGN KEY (candidate_clip_id) REFERENCES public.candidate_clips(id) ON DELETE SET NULL;