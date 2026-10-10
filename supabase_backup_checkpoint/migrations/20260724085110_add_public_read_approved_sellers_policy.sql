-- Allow public (anon) to read approved sellers for referral welcome page
-- This is intentionally scoped to approved sellers only, so pending/rejected sellers
-- are not exposed. The referral lookup on the homepage needs this to work for
-- unauthenticated buyers who scan a seller's QR code.
CREATE POLICY "public_read_approved_sellers" ON sellers
  FOR SELECT TO anon, authenticated
  USING (approval_status = 'approved');
