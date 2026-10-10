-- Fix: seller_owed_balance should return a row with 0s even for sellers with no sales
CREATE OR REPLACE FUNCTION public.seller_owed_balance(p_seller_id uuid)
RETURNS TABLE(total_sales_amount numeric, total_copies_sold bigint, avg_commission_pct numeric, adjustment_pct numeric, final_commission_pct numeric, total_commission_earned numeric, total_payouts numeric, owed_balance numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
WITH seller_data AS (
  SELECT commission_adjustment_pct
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
    pa.total_payouts
  FROM sales_agg sa, comm_stats cs, payouts_agg pa
  LEFT JOIN seller_data sd ON true
)
SELECT
  total_amount,
  copies,
  avg_comm,
  adj_pct,
  final_comm,
  ROUND(total_amount * final_comm / 100, 2) AS total_commission_earned,
  total_payouts,
  GREATEST(0, ROUND(total_amount * final_comm / 100, 2) - total_payouts) AS owed_balance
FROM calc
$function$;
