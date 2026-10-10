/*
# Payout system, seller notifications, T&C acceptance

## New Tables
1. payouts — records each payout (seller_id, amount, remaining_balance, created_at)
2. seller_notifications — in-app notifications for sellers (payout confirmations, etc.)

## Modified Tables
- sellers: add tnc_accepted_at (timestamptz) — when seller accepted T&C

## New Functions
- seller_owed_balance(p_seller_id) — returns total sales, commission earned, payouts, owed balance

## New Views
- seller_payout_status — all approved sellers with their owed balances (for admin payout tab)

## Security
- payouts: owner + admin SELECT; admin-only INSERT/UPDATE/DELETE
- seller_notifications: owner + admin SELECT; admin-only INSERT; owner + admin UPDATE; admin-only DELETE
*/

-- 1. payouts table
CREATE TABLE IF NOT EXISTS public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  remaining_balance numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payouts_seller_id_idx ON public.payouts (seller_id);
CREATE INDEX IF NOT EXISTS payouts_created_at_idx ON public.payouts (created_at);

-- 2. seller_notifications table
CREATE TABLE IF NOT EXISTS public.seller_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'payout',
  message text NOT NULL,
  amount numeric(10,2),
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seller_notifications_seller_id_idx ON public.seller_notifications (seller_id);
CREATE INDEX IF NOT EXISTS seller_notifications_created_at_idx ON public.seller_notifications (created_at);

-- 3. T&C acceptance column
ALTER TABLE public.sellers ADD COLUMN IF NOT EXISTS tnc_accepted_at timestamptz;

-- 4. RLS for payouts
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payouts_select_owner_admin" ON public.payouts;
CREATE POLICY "payouts_select_owner_admin"
ON public.payouts FOR SELECT
TO authenticated USING (auth.uid() = seller_id OR public.is_admin());

DROP POLICY IF EXISTS "payouts_insert_admin" ON public.payouts;
CREATE POLICY "payouts_insert_admin"
ON public.payouts FOR INSERT
TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "payouts_update_admin" ON public.payouts;
CREATE POLICY "payouts_update_admin"
ON public.payouts FOR UPDATE
TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "payouts_delete_admin" ON public.payouts;
CREATE POLICY "payouts_delete_admin"
ON public.payouts FOR DELETE
TO authenticated USING (public.is_admin());

-- 5. RLS for seller_notifications
ALTER TABLE public.seller_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_owner_admin" ON public.seller_notifications;
CREATE POLICY "notifications_select_owner_admin"
ON public.seller_notifications FOR SELECT
TO authenticated USING (auth.uid() = seller_id OR public.is_admin());

DROP POLICY IF EXISTS "notifications_insert_admin" ON public.seller_notifications;
CREATE POLICY "notifications_insert_admin"
ON public.seller_notifications FOR INSERT
TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "notifications_update_owner_admin" ON public.seller_notifications;
CREATE POLICY "notifications_update_owner_admin"
ON public.seller_notifications FOR UPDATE
TO authenticated USING (auth.uid() = seller_id OR public.is_admin())
WITH CHECK (auth.uid() = seller_id OR public.is_admin());

DROP POLICY IF EXISTS "notifications_delete_admin" ON public.seller_notifications;
CREATE POLICY "notifications_delete_admin"
ON public.seller_notifications FOR DELETE
TO authenticated USING (public.is_admin());

-- 6. seller_owed_balance function
CREATE OR REPLACE FUNCTION public.seller_owed_balance(p_seller_id uuid)
RETURNS TABLE (
  total_sales_amount numeric,
  total_copies_sold bigint,
  avg_commission_pct numeric,
  adjustment_pct numeric,
  final_commission_pct numeric,
  total_commission_earned numeric,
  total_payouts numeric,
  owed_balance numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH seller_data AS (
    SELECT commission_pct, commission_adjustment_pct
    FROM public.sellers WHERE id = p_seller_id
  ),
  sales_agg AS (
    SELECT COALESCE(SUM(amount), 0)::numeric(10,2) AS total_amount, COUNT(*)::bigint AS copies
    FROM public.sales WHERE seller_id = p_seller_id AND refunded = false
  ),
  comm_stats AS (
    SELECT COALESCE(
      (SELECT avg_commission_pct FROM public.seller_commission_stats WHERE seller_id = p_seller_id),
      (SELECT commission_pct FROM seller_data)
    ) AS avg_comm
  ),
  payouts_agg AS (
    SELECT COALESCE(SUM(amount), 0)::numeric(10,2) AS total_payouts
    FROM public.payouts WHERE seller_id = p_seller_id
  ),
  calc AS (
    SELECT
      sa.total_amount,
      sa.copies,
      cs.avg_comm,
      sd.commission_adjustment_pct,
      GREATEST(0, LEAST(100, cs.avg_comm + sd.commission_adjustment_pct)) AS final_comm,
      pa.total_payouts
    FROM seller_data sd, sales_agg sa, comm_stats cs, payouts_agg pa
  )
  SELECT
    total_amount,
    copies,
    avg_comm,
    commission_adjustment_pct,
    final_comm,
    ROUND(total_amount * final_comm / 100, 2) AS total_commission_earned,
    total_payouts,
    GREATEST(0, ROUND(total_amount * final_comm / 100, 2) - total_payouts) AS owed_balance
  FROM calc
$$;

GRANT EXECUTE ON FUNCTION public.seller_owed_balance(uuid) TO authenticated;

-- 7. seller_payout_status view
CREATE OR REPLACE VIEW public.seller_payout_status AS
SELECT s.id AS seller_id, s.shop_name, s.email, s.approval_status,
       b.total_sales_amount, b.total_copies_sold, b.avg_commission_pct,
       b.adjustment_pct, b.final_commission_pct, b.total_commission_earned,
       b.total_payouts, b.owed_balance
FROM public.sellers s
CROSS JOIN LATERAL public.seller_owed_balance(s.id) b
WHERE s.approval_status = 'approved';

GRANT SELECT ON public.seller_payout_status TO authenticated;
