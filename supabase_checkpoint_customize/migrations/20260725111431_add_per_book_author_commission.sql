-- Add per-book author commission column to author_books
ALTER TABLE author_books ADD COLUMN IF NOT EXISTS commission_pct numeric NOT NULL DEFAULT 30;

-- Allow admin to update author_books (for setting commission_pct)
CREATE POLICY "author_books_update_admin"
  ON author_books FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Drop and recreate author_book_stats view to use author_books.commission_pct
DROP VIEW IF EXISTS author_book_stats;
CREATE VIEW author_book_stats AS
SELECT
  ab.author_id,
  ab.book_id,
  b.title,
  COALESCE(ab.commission_pct, b.commission_pct) AS commission_pct,
  b.price,
  COALESCE(sa.units_sold, 0)::bigint AS units_sold,
  COALESCE(sa.revenue, 0)::numeric(10,2) AS revenue,
  COALESCE(sa.earnings, 0)::numeric(10,2) AS earnings
FROM author_books ab
JOIN books b ON b.id = ab.book_id
LEFT JOIN LATERAL (
  SELECT
    count(*) AS units_sold,
    sum(s.amount) AS revenue,
    sum(s.amount * COALESCE(ab.commission_pct, b.commission_pct) / 100::numeric) AS earnings
  FROM sales s
  WHERE s.book_id = ab.book_id AND s.refunded = false
) sa ON true;

-- Recreate author_owed_balance to use per-book author commission
CREATE OR REPLACE FUNCTION public.author_owed_balance(p_author_id uuid)
RETURNS TABLE(total_sales_amount numeric, total_copies_sold bigint, total_earnings numeric, total_payouts numeric, owed_balance numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
WITH author_books_list AS (
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
    COALESCE(SUM(sa.amount * abl.commission_pct / 100), 0)::numeric(10,2) AS earnings
  FROM public.sales sa
  JOIN author_books_list abl ON abl.book_id = sa.book_id
  WHERE sa.refunded = false
),
payouts_agg AS (
  SELECT COALESCE(SUM(amount), 0)::numeric(10,2) AS total_payouts
  FROM public.author_payouts WHERE author_id = p_author_id
)
SELECT
  sa.total_amount,
  sa.copies,
  ea.earnings,
  pa.total_payouts,
  GREATEST(0, ea.earnings - pa.total_payouts) AS owed_balance
FROM sales_agg sa, earnings_agg ea, payouts_agg pa
$function$;
