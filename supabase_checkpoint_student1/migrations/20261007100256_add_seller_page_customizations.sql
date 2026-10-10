/*
# Add seller page customization table

## Changes

### 1. New table: seller_page_customizations
- Stores per-seller visual customization for the referral landing page
- `id` (uuid, primary key)
- `seller_id` (uuid, unique, references sellers(id) ON DELETE CASCADE)
- `logo_url` (text, nullable — custom logo image URL, null = default Litora text logo)
- `background_color` (text, nullable — custom page background color, null = default #faf6ef)
- `accent_color` (text, nullable — custom button/highlight color, null = default #2d6a4f)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

### 2. Security
- RLS enabled on seller_page_customizations
- Public SELECT (anon + authenticated) so the referral landing page can read customizations without login
- Authenticated INSERT/UPDATE/DELETE (admin only in practice)

### 3. Important notes
- Only one row per seller (unique constraint on seller_id)
- If any field is null/empty, the referral page falls back to the default Litora design
- This table does NOT affect any other page — only the referral landing page reads from it
*/

CREATE TABLE IF NOT EXISTS seller_page_customizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL UNIQUE REFERENCES sellers(id) ON DELETE CASCADE,
  logo_url text,
  background_color text,
  accent_color text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE seller_page_customizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_seller_page_customizations" ON seller_page_customizations;
CREATE POLICY "anon_read_seller_page_customizations"
ON seller_page_customizations FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "auth_insert_seller_page_customizations" ON seller_page_customizations;
CREATE POLICY "auth_insert_seller_page_customizations"
ON seller_page_customizations FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_seller_page_customizations" ON seller_page_customizations;
CREATE POLICY "auth_update_seller_page_customizations"
ON seller_page_customizations FOR UPDATE
TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_seller_page_customizations" ON seller_page_customizations;
CREATE POLICY "auth_delete_seller_page_customizations"
ON seller_page_customizations FOR DELETE
TO authenticated
USING (true);
