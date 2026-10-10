/*
# Add author requests table, author form URL setting, and 1% default discount

1. New Tables
- `author_requests` — stores author sign-up submissions from the "Become an Author" flow.
  - `id` (uuid, primary key)
  - `name` (text, not null) — author's name
  - `email` (text, not null) — author's email
  - `created_at` (timestamptz, default now())
  - `viewed_by_admin` (boolean, default false) — tracks whether admin has seen this request (for red-dot indicator)
- `app_settings` — singleton table for admin-configurable app-wide settings.
  - `id` (int, primary key, always 1) — enforced singleton
  - `author_form_url` (text, default '') — the external Google Form URL authors are directed to
  - `updated_at` (timestamptz, default now())

2. Seed
- Insert singleton app_settings row (id=1) with empty author_form_url.
- Set all existing sellers' coupon-related discount to 1% by updating promo_banner_settings.discount_pct to 1.

3. Security
- Enable RLS on both new tables.
- author_requests: SELECT/INSERT public (anon + authenticated) so the public form can submit;
  UPDATE/DELETE admin-only (for marking viewed and cleanup).
- app_settings: SELECT public (homepage needs to read the author form URL); INSERT/UPDATE/DELETE admin-only.
*/

CREATE TABLE IF NOT EXISTS author_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  viewed_by_admin boolean NOT NULL DEFAULT false
);

ALTER TABLE author_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_author_requests" ON author_requests;
CREATE POLICY "anon_read_author_requests"
ON author_requests FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_author_requests" ON author_requests;
CREATE POLICY "anon_insert_author_requests"
ON author_requests FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "admin_update_author_requests" ON author_requests;
CREATE POLICY "admin_update_author_requests"
ON author_requests FOR UPDATE
TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_author_requests" ON author_requests;
CREATE POLICY "admin_delete_author_requests"
ON author_requests FOR DELETE
TO authenticated USING (public.is_admin());

CREATE TABLE IF NOT EXISTS app_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  author_form_url text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_app_settings" ON app_settings;
CREATE POLICY "anon_read_app_settings"
ON app_settings FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_update_app_settings" ON app_settings;
CREATE POLICY "admin_update_app_settings"
ON app_settings FOR UPDATE
TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_app_settings" ON app_settings;
CREATE POLICY "admin_insert_app_settings"
ON app_settings FOR INSERT
TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_app_settings" ON app_settings;
CREATE POLICY "admin_delete_app_settings"
ON app_settings FOR DELETE
TO authenticated USING (public.is_admin());

-- Set the default discount shown on the homepage to 1% going forward
UPDATE promo_banner_settings SET discount_pct = 1, updated_at = now() WHERE id = 1;
