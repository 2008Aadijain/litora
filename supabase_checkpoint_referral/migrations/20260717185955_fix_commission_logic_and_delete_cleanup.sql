-- Fix #1: Remove seller base commission fallback from commission calculations
-- A seller's avg commission must be based ENTIRELY on each book's own commission %,
-- averaged across sold copies. New sellers with no sales show 0%.

CREATE OR REPLACE VIEW public.seller_commission_stats AS
SELECT
  s.id AS seller_id,
  COALESCE(avg(b.commission_pct), 0) AS avg_commission_pct,
  count(sa.id) AS total_copies_sold
FROM sellers s
  LEFT JOIN sales sa ON sa.seller_id = s.id AND sa.refunded = false
  LEFT JOIN books b ON b.id = sa.book_id
GROUP BY s.id;

-- Fix seller_avg_commission: remove fallback to s.commission_pct
CREATE OR REPLACE FUNCTION public.seller_avg_commission(p_seller_id uuid)
RETURNS TABLE(avg_commission_pct numeric, total_copies_sold bigint, adjustment_pct numeric, final_commission_pct numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
SELECT
  COALESCE(stats.avg_commission_pct, 0) AS avg_commission_pct,
  COALESCE(stats.total_copies_sold, 0) AS total_copies_sold,
  s.commission_adjustment_pct AS adjustment_pct,
  GREATEST(0, LEAST(100,
    COALESCE(stats.avg_commission_pct, 0) + s.commission_adjustment_pct
  )) AS final_commission_pct
FROM public.sellers s
LEFT JOIN public.seller_commission_stats stats ON stats.seller_id = s.id
WHERE s.id = p_seller_id;
$function$;

-- Fix seller_owed_balance: remove fallback to s.commission_pct
CREATE OR REPLACE FUNCTION public.seller_owed_balance(p_seller_id uuid)
RETURNS TABLE(total_sales_amount numeric, total_copies_sold bigint, avg_commission_pct numeric, adjustment_pct numeric, final_commission_pct numeric, total_commission_earned numeric, total_payouts numeric, owed_balance numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
WITH sales_agg AS (
  SELECT COALESCE(SUM(amount), 0)::numeric(10,2) AS total_amount, COUNT(*)::bigint AS copies
  FROM public.sales WHERE seller_id = p_seller_id AND refunded = false
),
comm_stats AS (
  SELECT COALESCE(
    (SELECT avg_commission_pct FROM public.seller_commission_stats WHERE seller_id = p_seller_id),
    0
  ) AS avg_comm
),
seller_data AS (
  SELECT commission_adjustment_pct FROM public.sellers WHERE id = p_seller_id
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
$function$;

-- Fix #5: Full cleanup on seller delete — remove all associated data
CREATE OR REPLACE FUNCTION public.delete_seller_account(p_seller_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  seller_email text;
  caller_is_admin boolean;
BEGIN
  SELECT public.is_admin() INTO caller_is_admin;
  IF NOT caller_is_admin THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  SELECT email INTO seller_email FROM public.sellers WHERE id = p_seller_id;
  IF seller_email IS NULL THEN
    RAISE EXCEPTION 'Seller not found';
  END IF;

  -- Delete all associated data
  DELETE FROM public.sales WHERE seller_id = p_seller_id;
  DELETE FROM public.payouts WHERE seller_id = p_seller_id;
  DELETE FROM public.visits WHERE seller_id = p_seller_id;
  DELETE FROM public.seller_seen_books WHERE seller_id = p_seller_id;
  DELETE FROM public.chat_messages WHERE seller_id = p_seller_id;
  DELETE FROM public.commission_history WHERE seller_id = p_seller_id;
  DELETE FROM public.seller_notifications WHERE seller_id = p_seller_id;
  DELETE FROM public.sellers WHERE id = p_seller_id;
  DELETE FROM auth.users WHERE id = p_seller_id;

  RETURN format('Seller %s (%s) deleted successfully with all associated data', p_seller_id, seller_email);
END;
$function$;
