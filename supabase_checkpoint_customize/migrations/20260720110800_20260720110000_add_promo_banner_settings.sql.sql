/*
# Add admin-editable promo banner settings

1. New Tables
- `promo_banner_settings` — single-row table holding the homepage promo banner content.
  - `id` (int, primary key, always 1) — enforced singleton.
  - `promo_enabled` (boolean, default true) — whether the banner is shown.
  - `discount_code` (text, default 'LITORA15') — the code buyers copy at checkout.
  - `discount_pct` (numeric, default 15, check 0..100) — the percentage displayed.
  - `headline` (text, default 'Limited time offer — 15% off your first book') — banner headline.
  - `subtext` (text, default 'Copy this code, then paste it in the discount box at checkout.') — supporting copy.
  - `updated_at` (timestamptz, default now()) — last edit timestamp.
  - `updated_by` (uuid, nullable) — admin user who last edited.

2. Seed
- Insert the singleton row (id=1) with the current hardcoded defaults so the homepage
  keeps showing the existing "LITORA15 / 15%" banner until an admin changes it.

3. Security
- Enable RLS on `promo_banner_settings`.
- SELECT: public (anon + authenticated) — the homepage must read it without a session.
- INSERT/UPDATE/DELETE: authenticated admin only (guarded by `is_admin()` rpc), so only
  the admin dashboard can edit the banner.
*/

CREATE TABLE IF NOT EXISTS promo_banner_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  promo_enabled boolean NOT NULL DEFAULT true,
  discount_code text NOT NULL DEFAULT 'LITORA15',
  discount_pct numeric NOT NULL DEFAULT 15 CHECK (discount_pct >= 0 AND discount_pct <= 100),
  headline text NOT NULL DEFAULT 'Limited time offer — 15% off your first book',
  subtext text NOT NULL DEFAULT 'Copy this code, then paste it in the discount box at checkout.',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

INSERT INTO promo_banner_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE promo_banner_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_promo_banner" ON promo_banner_settings;
CREATE POLICY "anon_read_promo_banner"
ON promo_banner_settings FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_promo_banner" ON promo_banner_settings;
CREATE POLICY "admin_insert_promo_banner"
ON promo_banner_settings FOR INSERT
TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_promo_banner" ON promo_banner_settings;
CREATE POLICY "admin_update_promo_banner"
ON promo_banner_settings FOR UPDATE
TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_promo_banner" ON promo_banner_settings;
CREATE POLICY "admin_delete_promo_banner"
ON promo_banner_settings FOR DELETE
TO authenticated USING (public.is_admin());
