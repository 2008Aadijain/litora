/*
# Commission tracking, history, and new-book notifications

## Overview
Adds automatic commission adjustment based on monthly target performance, a commission
history log so sellers can see why their commission changed, and a mechanism for showing
"new book added" notification banners in seller dashboards.

## New Tables
1. `commission_history` — log of every commission adjustment with reason.
   - seller_id, old_pct, new_pct, reason (target_hit|target_missed|manual_adjustment), month_label (e.g. "2025-01"), created_at
2. `seller_seen_books` — tracks which books each seller has already dismissed/seen the banner for.
   - seller_id, book_id, seen_at

## Modified Tables
- `sellers`: add `last_adjusted_month` (text, nullable) — the month label of the last
  automatic adjustment applied (prevents duplicate adjustments for the same month).
  Add `commission_adjusted_at` (timestamptz) — timestamp of last auto-adjustment.

## RPC Functions
- `apply_monthly_commission_adjustments()` — SECURITY DEFINER. Runs the monthly target
  check for ALL approved sellers. For each seller, looks at the PREVIOUS calendar month's
  sales count. If sales >= monthly_target, adds bonus_margin_pct to commission_pct (capped
  at 100). If sales < monthly_target, subtracts penalty_margin_pct (floored at 0). Records
  an entry in commission_history. Skips sellers already adjusted for the current month
  (via last_adjusted_month). Returns a summary text. Safe to call repeatedly (idempotent).

## Security
- `commission_history`: owner-seller + admin SELECT; admin-only INSERT/UPDATE/DELETE.
- `seller_seen_books`: owner-seller + admin SELECT; self INSERT; self + admin DELETE.
- `apply_monthly_commission_adjustments()`: executable by authenticated (admin calls it).
- All policies use auth.uid().

## Notes
1. The RPC is called by the admin when they open the admin dashboard (or manually triggered).
   It processes the previous month for all approved sellers in one call.
2. The `last_adjusted_month` column prevents double-adjustment if called multiple times.
3. Commission changes are capped: never below 0%, never above 100%.
*/

-- ============================================================
-- 1. Add columns to sellers
-- ============================================================
ALTER TABLE public.sellers
  ADD COLUMN IF NOT EXISTS last_adjusted_month text,
  ADD COLUMN IF NOT EXISTS commission_adjusted_at timestamptz;

-- ============================================================
-- 2. commission_history table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.commission_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  old_pct numeric(5,2) NOT NULL,
  new_pct numeric(5,2) NOT NULL,
  reason text NOT NULL CHECK (reason IN ('target_hit','target_missed','manual_adjustment')),
  month_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commission_history_seller_id_idx ON public.commission_history (seller_id);
CREATE INDEX IF NOT EXISTS commission_history_created_at_idx ON public.commission_history (created_at);

ALTER TABLE public.commission_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commission_history_select_owner_admin" ON public.commission_history;
CREATE POLICY "commission_history_select_owner_admin"
ON public.commission_history FOR SELECT
TO authenticated USING (auth.uid() = seller_id OR public.is_admin());

DROP POLICY IF EXISTS "commission_history_insert_admin" ON public.commission_history;
CREATE POLICY "commission_history_insert_admin"
ON public.commission_history FOR INSERT
TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "commission_history_update_admin" ON public.commission_history;
CREATE POLICY "commission_history_update_admin"
ON public.commission_history FOR UPDATE
TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "commission_history_delete_admin" ON public.commission_history;
CREATE POLICY "commission_history_delete_admin"
ON public.commission_history FOR DELETE
TO authenticated USING (public.is_admin());

-- ============================================================
-- 3. seller_seen_books table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.seller_seen_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seller_id, book_id)
);

CREATE INDEX IF NOT EXISTS seller_seen_books_seller_id_idx ON public.seller_seen_books (seller_id);

ALTER TABLE public.seller_seen_books ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "seller_seen_books_select_owner_admin" ON public.seller_seen_books;
CREATE POLICY "seller_seen_books_select_owner_admin"
ON public.seller_seen_books FOR SELECT
TO authenticated USING (auth.uid() = seller_id OR public.is_admin());

DROP POLICY IF EXISTS "seller_seen_books_insert_self" ON public.seller_seen_books;
CREATE POLICY "seller_seen_books_insert_self"
ON public.seller_seen_books FOR INSERT
TO authenticated WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "seller_seen_books_delete_owner_admin" ON public.seller_seen_books;
CREATE POLICY "seller_seen_books_delete_owner_admin"
ON public.seller_seen_books FOR DELETE
TO authenticated USING (auth.uid() = seller_id OR public.is_admin());

-- ============================================================
-- 4. RPC: apply_monthly_commission_adjustments
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_monthly_commission_adjustments()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  now_ts timestamptz := now();
  prev_month date := date_trunc('month', now_ts)::date - interval '1 month';
  prev_month_label text := to_char(prev_month, 'YYYY-MM');
  current_month_label text := to_char(date_trunc('month', now_ts), 'YYYY-MM');
  seller_rec RECORD;
  prev_month_sales_count integer;
  old_comm numeric(5,2);
  new_comm numeric(5,2);
  reason text;
  adjusted_count integer := 0;
  skipped_count integer := 0;
BEGIN
  FOR seller_rec IN
    SELECT id, commission_pct, monthly_target, bonus_margin_pct, penalty_margin_pct, last_adjusted_month
    FROM public.sellers
    WHERE approval_status = 'approved'
  LOOP
    -- Skip if already adjusted for this month
    IF seller_rec.last_adjusted_month = current_month_label THEN
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    -- Count previous month's sales for this seller
    SELECT count(*) INTO prev_month_sales_count
    FROM public.sales
    WHERE seller_id = seller_rec.id
      AND sale_date >= prev_month
      AND sale_date < date_trunc('month', now_ts)::date;

    old_comm := seller_rec.commission_pct;

    IF prev_month_sales_count >= seller_rec.monthly_target THEN
      new_comm := least(100, old_comm + seller_rec.bonus_margin_pct);
      reason := 'target_hit';
    ELSE
      new_comm := greatest(0, old_comm - seller_rec.penalty_margin_pct);
      reason := 'target_missed';
    END IF;

    -- Only update if commission actually changed
    IF new_comm <> old_comm THEN
      UPDATE public.sellers
      SET commission_pct = new_comm,
          last_adjusted_month = current_month_label,
          commission_adjusted_at = now_ts
      WHERE id = seller_rec.id;

      INSERT INTO public.commission_history (seller_id, old_pct, new_pct, reason, month_label)
      VALUES (seller_rec.id, old_comm, new_comm, reason, prev_month_label);
    ELSE
      -- Even if no change, mark as adjusted so we don't re-check
      UPDATE public.sellers
      SET last_adjusted_month = current_month_label,
          commission_adjusted_at = now_ts
      WHERE id = seller_rec.id;
    END IF;

    adjusted_count := adjusted_count + 1;
  END LOOP;

  RETURN format('Processed %s sellers (%s skipped, already adjusted). Month: %s adjustments for %s performance.',
    adjusted_count, skipped_count, current_month_label, prev_month_label);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_monthly_commission_adjustments() TO authenticated;
