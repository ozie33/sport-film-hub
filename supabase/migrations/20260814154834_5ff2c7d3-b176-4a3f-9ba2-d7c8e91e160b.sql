CREATE TABLE public.product_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_name text NOT NULL,
  session_id text NOT NULL,
  game_id uuid,
  player_id uuid,
  reel_id uuid,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.product_events TO authenticated;
GRANT ALL ON public.product_events TO service_role;

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can record their own product events"
  ON public.product_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own product events"
  ON public.product_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all product events"
  ON public.product_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX product_events_user_time_idx ON public.product_events (user_id, occurred_at);
CREATE INDEX product_events_name_time_idx ON public.product_events (event_name, occurred_at);
CREATE INDEX product_events_session_idx ON public.product_events (session_id);