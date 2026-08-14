CREATE TABLE public.reels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  title text NOT NULL,
  reel_type text NOT NULL DEFAULT 'best_plays',
  player_id uuid REFERENCES public.players ON DELETE SET NULL,
  game_id uuid REFERENCES public.games ON DELETE SET NULL,
  summary text,
  reviewed_clip_count integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  parent_reel_id uuid REFERENCES public.reels ON DELETE SET NULL,
  source_game_ids uuid[] NOT NULL DEFAULT '{}',
  generation_prompt text,
  model_version text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.reel_clips (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id uuid NOT NULL REFERENCES public.reels ON DELETE CASCADE,
  clip_id uuid NOT NULL REFERENCES public.clips ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  ai_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reel_id, clip_id)
);

CREATE TABLE public.ai_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  report_type text NOT NULL,
  game_id uuid REFERENCES public.games ON DELETE CASCADE,
  player_id uuid REFERENCES public.players ON DELETE CASCADE,
  reviewed_clip_count integer NOT NULL DEFAULT 0,
  content jsonb NOT NULL DEFAULT '{}',
  model_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reel_clips_reel_id_idx ON public.reel_clips (reel_id);
CREATE INDEX ai_reports_owner_idx ON public.ai_reports (owner_id, report_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reels TO authenticated;
GRANT ALL ON public.reels TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reel_clips TO authenticated;
GRANT ALL ON public.reel_clips TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_reports TO authenticated;
GRANT ALL ON public.ai_reports TO service_role;

ALTER TABLE public.reels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_reports ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.owns_reel(_reel_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.reels WHERE id = _reel_id AND owner_id = auth.uid())
$$;

CREATE FUNCTION public.can_view_reel(_reel_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.owns_reel(_reel_id) OR public.has_resource_share('reel', _reel_id)
$$;

CREATE POLICY "Owners manage their reels" ON public.reels FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Shared viewers read reels" ON public.reels FOR SELECT TO authenticated
  USING (public.has_resource_share('reel', id));

CREATE POLICY "Owners manage reel clips" ON public.reel_clips FOR ALL TO authenticated
  USING (public.owns_reel(reel_id)) WITH CHECK (public.owns_reel(reel_id));
CREATE POLICY "Shared viewers read reel clips" ON public.reel_clips FOR SELECT TO authenticated
  USING (public.can_view_reel(reel_id));

CREATE POLICY "Owners manage their AI reports" ON public.ai_reports FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Shared viewers read AI reports" ON public.ai_reports FOR SELECT TO authenticated
  USING (
    public.has_resource_share('development_report', id)
    OR public.has_resource_share('film_review', id)
  );

CREATE TRIGGER reels_updated_at BEFORE UPDATE ON public.reels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ai_reports_updated_at BEFORE UPDATE ON public.ai_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();