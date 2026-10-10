/*
# Add Platform Fee Deduction

1. New Columns
- sellers.platform_fee_pct (numeric, NOT NULL, default 7) — editable per seller by admin
- authors.platform_fee_pct (numeric, NOT NULL, default 7) — editable per author by admin

2. Modified Functions
- seller_owed_balance: now deducts platform fee from commission earnings BEFORE computing owed balance.
  Adds output columns: platform_fee_pct, total_earnings (net, post-fee).
  total_commission_earned remains as gross (pre-fee) for admin visibility.
  owed_balance is now post-fee: net_earnings - total_payouts.
- author_owed_balance: now deducts platform fee from earnings BEFORE computing owed balance.
  Adds output columns: gross_earnings (pre-fee), platform_fee_pct.
  total_earnings is now net (post-fee). owed_balance is post-fee.

3. Modified Views
- author_book_stats: per-book earnings now post-fee; adds platform_fee_pct and gross_earnings columns.
- seller_payout_status: updated LATERAL column list to match new seller_owed_balance return signature.

4. Important Notes
- The fee is applied AFTER commission calculation: net = gross_commission × (1 - fee/100)
- owed_balance = net_earnings - total_payouts (post-fee)
- Existing commission rates and calculation logic are unchanged — fee is an additional deduction on top
- Default fee is 7%, editable per seller/author by admin
- Seller dashboard "Net Earnings" (which referenced total_earnings) now shows the correct post-fee value
*/

-- Add platform fee columns
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS platform_fee_pct numeric NOT NULL DEFAULT 7;
ALTER TABLE authors ADD COLUMN IF NOT EXISTS platform_fee_pct numeric NOT NULL DEFAULT 7;

-- Drop dependent views first
DROP VIEW IF EXISTS seller_payout_status;
DROP VIEW IF EXISTS author_book_stats;

-- Recreate seller_owed_balance with platform fee deduction
DROP FUNCTION IF EXISTS seller_owed_balance(uuid);
CREATE FUNCTION public.seller_owed_balance(p_seller_id uuid)
RETURNS TABLE(
  total_sales_amount numeric,
  total_copies_sold bigint,
  avg_commission_pct numeric,
  adjustment_pct numeric,
  final_commission_pct numeric,
  total_commission_earned numeric,
  platform_fee_pct numeric,
  total_earnings numeric,
  total_payouts numeric,
  owed_balance numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $function$
WITH seller_data AS (
  SELECT commission_adjustment_pct, platform_fee_pct
  FROM public.sellers WHERE id = p_seller_id
),
sales_agg AS (
  SELECT COALESCE(SUM(amount), 0)::numeric(10,2) AS total_amount, COUNT(*)::bigint AS copies
  FROM public.sales WHERE seller_id = p_seller_id AND refunded = false
),
comm_stats AS (
  SELECT COALESCE(
    (SELECT avg_commission_pct FROM public.seller_commission_stats WHERE seller_id = p_seller_id),
    0
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
    COALESCE(sd.commission_adjustment_pct, 0) AS adj_pct,
    GREATEST(0, LEAST(100, cs.avg_comm + COALESCE(sd.commission_adjustment_pct, 0))) AS final_comm,
    COALESCE(sd.platform_fee_pct, 7) AS fee_pct,
    pa.total_payouts
  FROM sales_agg sa, comm_stats cs, payouts_agg pa
  LEFT JOIN seller_data sd ON true
)
SELECT
  total_amount AS total_sales_amount,
  copies AS total_copies_sold,
  avg_comm AS avg_commission_pct,
  adj_pct AS adjustment_pct,
  final_comm AS final_commission_pct,
  ROUND(total_amount * final_comm / 100, 2) AS total_commission_earned,
  fee_pct AS platform_fee_pct,
  ROUND(ROUND(total_amount * final_comm / 100, 2) * (1 - fee_pct / 100), 2) AS total_earnings,
  total_payouts,
  GREATEST(0, ROUND(ROUND(total_amount * final_comm / 100, 2) * (1 - fee_pct / 100), 2) - total_payouts) AS owed_balance
FROM calc
$function$;

-- Recreate author_owed_balance with platform fee deduction
DROP FUNCTION IF EXISTS author_owed_balance(uuid);
CREATE FUNCTION public.author_owed_balance(p_author_id uuid)
RETURNS TABLE(
  total_sales_amount numeric,
  total_copies_sold bigint,
  gross_earnings numeric,
  platform_fee_pct numeric,
  total_earnings numeric,
  total_payouts numeric,
  owed_balance numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $function$
WITH author_data AS (
  SELECT platform_fee_pct FROM public.authors WHERE id = p_author_id
),
author_books_list AS (
  SELECT ab.book_id, COALESCE(ab.commission_pct, b.commission_pct) AS commission_pct
  FROM public.author_books ab
  JOIN public.books b ON b.id = ab.book_id
  WHERE ab.author_id = p_author_id
),
sales_agg AS (
  SELECT
    COALESCE(SUM(sa.amount), 0)::numeric(10,2) AS total_amount,
    COUNT(*)::bigint AS copies
  FROM public.sales sa
  JOIN author_books_list abl ON abl.book_id = sa.book_id
  WHERE sa.refunded = false
),
earnings_agg AS (
  SELECT
    COALESCE(SUM(sa.amount * abl.commission_pct / 100), 0)::numeric(10,2) AS gross_earnings
  FROM public.sales sa
  JOIN author_books_list abl ON abl.book_id = sa.book_id
  WHERE sa.refunded = false
),
payouts_agg AS (
  SELECT COALESCE(SUM(amount), 0)::numeric(10,2) AS total_payouts
  FROM public.author_payouts WHERE author_id = p_author_id
)
SELECT
  sa.total_amount AS total_sales_amount,
  sa.copies AS total_copies_sold,
  ea.gross_earnings,
  COALESCE(ad.platform_fee_pct, 7) AS platform_fee_pct,
  ROUND(ea.gross_earnings * (1 - COALESCE(ad.platform_fee_pct, 7) / 100), 2) AS total_earnings,
  pa.total_payouts,
  GREATEST(0, ROUND(ea.gross_earnings * (1 - COALESCE(ad.platform_fee_pct, 7) / 100), 2) - pa.total_payouts) AS owed_balance
FROM sales_agg sa, earnings_agg ea, payouts_agg pa
LEFT JOIN author_data ad ON true
$function$;

-- Recreate author_book_stats view with per-book platform fee deduction
CREATE VIEW author_book_stats AS
SELECT
  ab.author_id,
  ab.book_id,
  b.title,
  COALESCE(ab.commission_pct, b.commission_pct) AS commission_pct,
  a.platform_fee_pct,
  b.price,
  COALESCE(sa.units_sold, 0)::bigint AS units_sold,
  COALESCE(sa.revenue, 0)::numeric(10,2) AS revenue,
  COALESCE(sa.gross_earnings, 0)::numeric(10,2) AS gross_earnings,
  COALESCE(sa.earnings, 0)::numeric(10,2) AS earnings
FROM author_books ab
JOIN books b ON b.id = ab.book_id
JOIN authors a ON a.id = ab.author_id
LEFT JOIN LATERAL (
  SELECT
    count(*) AS units_sold,
    sum(s.amount) AS revenue,
    sum(s.amount * COALESCE(ab.commission_pct, b.commission_pct) / 100::numeric) AS gross_earnings,
    sum(s.amount * COALESCE(ab.commission_pct, b.commission_pct) / 100::numeric * (1 - a.platform_fee_pct / 100::numeric)) AS earnings
  FROM sales s
  WHERE s.book_id = ab.book_id AND s.refunded = false
) sa ON true;

-- Recreate seller_payout_status view with updated LATERAL column list
CREATE VIEW seller_payout_status AS
SELECT
  s.id AS seller_id,
  s.shop_name,
  s.email,
  s.approval_status,
  b.total_sales_amount,
  b.total_copies_sold,
  b.avg_commission_pct,
  b.adjustment_pct,
  b.final_commission_pct,
  b.total_commission_earned,
  b.platform_fee_pct,
  b.total_earnings,
  b.total_payouts,
  b.owed_balance
FROM sellers s
  CROSS JOIN LATERAL seller_owed_balance(s.id) b(
    total_sales_amount, total_copies_sold, avg_commission_pct,
    adjustment_pct, final_commission_pct, total_commission_earned,
    platform_fee_pct, total_earnings, total_payouts, owed_balance
  )
WHERE s.approval_status = 'approved';
