-- Add QR code and view tracking columns to sellers
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS qr_code_url text;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS qr_code_branded_url text;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS qr_referral_url text;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS view_count integer DEFAULT 0;

-- Enable RLS-safe update for view_count (anon can increment views)
CREATE POLICY "update_view_count_sellers" ON sellers FOR UPDATE
  TO anon, authenticated
  USING (true) WITH CHECK (true);
