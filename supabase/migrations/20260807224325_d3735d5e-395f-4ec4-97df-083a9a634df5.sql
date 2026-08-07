CREATE POLICY "Recipients read shared games"
ON public.games FOR SELECT TO authenticated
USING (public.has_resource_share('game', id));

CREATE POLICY "Recipients read shared game film"
ON public.video_assets FOR SELECT TO authenticated
USING (public.has_resource_share('game', game_id));

CREATE POLICY "Recipients read shared game events"
ON public.events FOR SELECT TO authenticated
USING (public.has_resource_share('game', game_id));

CREATE POLICY "Recipients read shared game clips"
ON public.clips FOR SELECT TO authenticated
USING (public.has_resource_share('game', game_id));