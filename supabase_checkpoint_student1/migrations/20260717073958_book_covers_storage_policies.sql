-- Storage policies for book-covers bucket (public read, authenticated upload)
CREATE POLICY "book_covers_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'book-covers');

CREATE POLICY "book_covers_auth_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'book-covers');

CREATE POLICY "book_covers_auth_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'book-covers') WITH CHECK (bucket_id = 'book-covers');

CREATE POLICY "book_covers_auth_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'book-covers');
