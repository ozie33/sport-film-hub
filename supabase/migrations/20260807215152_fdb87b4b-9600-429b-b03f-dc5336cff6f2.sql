UPDATE public.video_assets SET processing_status = 'ready' WHERE ingestion_status = 'ready' AND processing_status = 'waiting';

UPDATE public.games g SET video_status = CASE
  WHEN EXISTS (SELECT 1 FROM public.video_assets va WHERE va.game_id = g.id AND va.ingestion_status = 'ready') THEN 'ready_for_review'
  WHEN EXISTS (SELECT 1 FROM public.video_assets va WHERE va.game_id = g.id AND va.ingestion_status = 'processing') THEN 'processing'
  WHEN EXISTS (SELECT 1 FROM public.video_assets va WHERE va.game_id = g.id AND va.ingestion_status = 'uploaded') THEN 'uploaded'
  ELSE g.video_status
END
WHERE EXISTS (SELECT 1 FROM public.video_assets va WHERE va.game_id = g.id);