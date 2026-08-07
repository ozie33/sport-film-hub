CREATE POLICY "Users manage own player reference files"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'player-references' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'player-references' AND (storage.foldername(name))[1] = auth.uid()::text);
