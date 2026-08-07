CREATE POLICY "own film read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'game-film' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own film insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'game-film' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own film update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'game-film' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'game-film' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own film delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'game-film' AND (storage.foldername(name))[1] = auth.uid()::text);