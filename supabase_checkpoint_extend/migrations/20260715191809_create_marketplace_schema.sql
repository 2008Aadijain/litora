/*
# Ebook Marketplace — initial schema

## Overview
Creates the full data model for an ebook marketplace with two roles:
- Admin (a single privileged account, bootstrapped via one-time setup)
- Sellers (bookshop partners who self-sign-up and are approved by admin)

## Tables
1. `books` — catalog of ebooks for sale on the public storefront.
2. `sellers` — bookshop partner accounts. `id` maps to auth.users.id (the seller's login).
3. `visits` — recorded when a customer lands on a seller's referral link.
4. `sales` — manually entered by admin for now (webhook comes later).
5. `admins` — the single admin account mapping (user_id -> auth.users.id).

## Views
- `public_seller_codes` — exposes only (id, shop_name, referral_code, offer_code) for APPROVED sellers.

## Helper functions
- `is_admin()` — returns true if the current auth user is in `admins`. SECURITY DEFINER.
- `no_admin_exists()` — returns true if `admins` is empty. Used by the one-time admin setup.

## Security (RLS)
- `books`: public SELECT; admin-only INSERT/UPDATE/DELETE.
- `sellers`: owner (self) + admin SELECT/UPDATE; self INSERT at signup; admin-only DELETE.
- `visits`: anon+authenticated INSERT (public referral landing); owner-seller + admin SELECT; admin-only UPDATE/DELETE.
- `sales`: owner-seller + admin SELECT; admin-only INSERT/UPDATE/DELETE.
- `admins`: admin-only SELECT; INSERT allowed only when no admin exists yet.

## Notes
1. Seller accounts are created at signup time via Supabase auth (email/password). The
   `sellers` row is inserted with approval_status='pending'. Login is gated in the app on
   approval_status='approved'.
2. `public_seller_codes` is granted SELECT to anon and authenticated so the public referral
   route can resolve a code without exposing sensitive seller fields.
3. All policies use auth.uid() (never current_user).
*/

-- ============================================================
-- 1. TABLES (no function references)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  price numeric(10,2) NOT NULL DEFAULT 0,
  gumroad_url text NOT NULL,
  sample_text text,
  cover_image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sellers (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_name text NOT NULL,
  email text NOT NULL,
  referral_code text NOT NULL UNIQUE,
  offer_code text NOT NULL UNIQUE,
  commission_pct numeric(5,2) NOT NULL DEFAULT 10 CHECK (commission_pct >= 0),
  monthly_target integer NOT NULL DEFAULT 10 CHECK (monthly_target >= 0),
  bonus_margin_pct numeric(5,2) NOT NULL DEFAULT 0,
  penalty_margin_pct numeric(5,2) NOT NULL DEFAULT 0,
  approval_status text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected')),
  first_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sellers_referral_code_idx ON public.sellers (referral_code);
CREATE INDEX IF NOT EXISTS sellers_approval_status_idx ON public.sellers (approval_status);

CREATE TABLE IF NOT EXISTS public.visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid REFERENCES public.sellers(id) ON DELETE CASCADE,
  book_id uuid REFERENCES public.books(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visits_seller_id_idx ON public.visits (seller_id);
CREATE INDEX IF NOT EXISTS visits_created_at_idx ON public.visits (created_at);

CREATE TABLE IF NOT EXISTS public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid REFERENCES public.sellers(id) ON DELETE CASCADE,
  book_id uuid REFERENCES public.books(id) ON DELETE SET NULL,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  sale_date date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_seller_id_idx ON public.sales (seller_id);
CREATE INDEX IF NOT EXISTS sales_sale_date_idx ON public.sales (sale_date);

CREATE TABLE IF NOT EXISTS public.admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. HELPER FUNCTIONS (tables now exist)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.no_admin_exists()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.admins);
$$;

-- ============================================================
-- 3. RLS + POLICIES (functions now exist)
-- ============================================================

-- ---------- books ----------
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "books_select_public" ON public.books;
CREATE POLICY "books_select_public"
ON public.books FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "books_insert_admin" ON public.books;
CREATE POLICY "books_insert_admin"
ON public.books FOR INSERT
TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "books_update_admin" ON public.books;
CREATE POLICY "books_update_admin"
ON public.books FOR UPDATE
TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "books_delete_admin" ON public.books;
CREATE POLICY "books_delete_admin"
ON public.books FOR DELETE
TO authenticated USING (public.is_admin());

-- ---------- sellers ----------
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sellers_select_owner_admin" ON public.sellers;
CREATE POLICY "sellers_select_owner_admin"
ON public.sellers FOR SELECT
TO authenticated USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "sellers_insert_self" ON public.sellers;
CREATE POLICY "sellers_insert_self"
ON public.sellers FOR INSERT
TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "sellers_update_owner_admin" ON public.sellers;
CREATE POLICY "sellers_update_owner_admin"
ON public.sellers FOR UPDATE
TO authenticated
USING (auth.uid() = id OR public.is_admin())
WITH CHECK (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "sellers_delete_admin" ON public.sellers;
CREATE POLICY "sellers_delete_admin"
ON public.sellers FOR DELETE
TO authenticated USING (public.is_admin());

-- ---------- visits ----------
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visits_insert_public" ON public.visits;
CREATE POLICY "visits_insert_public"
ON public.visits FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "visits_select_owner_admin" ON public.visits;
CREATE POLICY "visits_select_owner_admin"
ON public.visits FOR SELECT
TO authenticated USING (auth.uid() = seller_id OR public.is_admin());

DROP POLICY IF EXISTS "visits_update_admin" ON public.visits;
CREATE POLICY "visits_update_admin"
ON public.visits FOR UPDATE
TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "visits_delete_admin" ON public.visits;
CREATE POLICY "visits_delete_admin"
ON public.visits FOR DELETE
TO authenticated USING (public.is_admin());

-- ---------- sales ----------
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_select_owner_admin" ON public.sales;
CREATE POLICY "sales_select_owner_admin"
ON public.sales FOR SELECT
TO authenticated USING (auth.uid() = seller_id OR public.is_admin());

DROP POLICY IF EXISTS "sales_insert_admin" ON public.sales;
CREATE POLICY "sales_insert_admin"
ON public.sales FOR INSERT
TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "sales_update_admin" ON public.sales;
CREATE POLICY "sales_update_admin"
ON public.sales FOR UPDATE
TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "sales_delete_admin" ON public.sales;
CREATE POLICY "sales_delete_admin"
ON public.sales FOR DELETE
TO authenticated USING (public.is_admin());

-- ---------- admins ----------
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_select_admin" ON public.admins;
CREATE POLICY "admins_select_admin"
ON public.admins FOR SELECT
TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admins_insert_first_only" ON public.admins;
CREATE POLICY "admins_insert_first_only"
ON public.admins FOR INSERT
TO authenticated WITH CHECK (public.no_admin_exists());

-- ============================================================
-- 4. PUBLIC VIEW for referral lookups
-- ============================================================

CREATE OR REPLACE VIEW public.public_seller_codes AS
SELECT id, shop_name, referral_code, offer_code
FROM public.sellers
WHERE approval_status = 'approved';

GRANT SELECT ON public.public_seller_codes TO anon, authenticated;
