-- Create seller-assets bucket for QR codes and posters
INSERT INTO storage.buckets (id, name, public)
VALUES ('seller-assets', 'seller-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read
CREATE POLICY "public_read_seller_assets" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'seller-assets');

-- Allow authenticated upload
CREATE POLICY "auth_upload_seller_assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'seller-assets');

-- Allow authenticated update (upsert)
CREATE POLICY "auth_update_seller_assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'seller-assets');

-- Allow authenticated delete
CREATE POLICY "auth_delete_seller_assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'seller-assets');

-- RPC to increment seller view count atomically
CREATE OR REPLACE FUNCTION increment_seller_views(p_seller_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE sellers SET view_count = COALESCE(view_count, 0) + 1 WHERE id = p_seller_id;
END;
$$;
