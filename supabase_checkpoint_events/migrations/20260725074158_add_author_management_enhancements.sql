/*
# Author management enhancements

Additive only — no existing tables/columns modified.

## New Table
- `book_seller_commission_overrides` — per-book, per-seller commission % override.
  When admin sets a seller's commission for a specific book, it takes precedence
  over the seller's global rate. Used for the author detail breakdown display.
  (book_id, seller_id) is the primary key.

## New View
- `author_book_seller_breakdown` — for each author's assigned book, shows per-seller
  units sold and revenue. Joins author_books → books → sales → sellers.

## New Function
- `admin_delete_author_account(p_author_id uuid)` — SECURITY DEFINER.
  Deletes an author and all associated data (author_books, author_payouts,
  author_chat_messages, author_notifications) plus the auth.users entry.
  Admin-only (mirrors delete_seller_account).
*/

-- 1. book_seller_commission_overrides
CREATE TABLE IF NOT EXISTS public.book_seller_commission_overrides (
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  commission_pct numeric(5,2) NOT NULL DEFAULT 10 CHECK (commission_pct >= 0 AND commission_pct <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (book_id, seller_id)
);

ALTER TABLE public.book_seller_commission_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bsco_select_admin" ON public.book_seller_commission_overrides;
CREATE POLICY "bsco_select_admin"
ON public.book_seller_commission_overrides FOR SELECT
TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "bsco_insert_admin" ON public.book_seller_commission_overrides;
CREATE POLICY "bsco_insert_admin"
ON public.book_seller_commission_overrides FOR INSERT
TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "bsco_update_admin" ON public.book_seller_commission_overrides;
CREATE POLICY "bsco_update_admin"
ON public.book_seller_commission_overrides FOR UPDATE
TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "bsco_delete_admin" ON public.book_seller_commission_overrides;
CREATE POLICY "bsco_delete_admin"
ON public.book_seller_commission_overrides FOR DELETE
TO authenticated USING (public.is_admin());

-- 2. author_book_seller_breakdown view
CREATE OR REPLACE VIEW public.author_book_seller_breakdown AS
SELECT
  ab.author_id,
  b.id AS book_id,
  b.title AS book_title,
  s.id AS seller_id,
  s.shop_name AS seller_name,
  s.referral_code AS seller_referral_code,
  COALESCE(sa.units_sold, 0)::bigint AS units_sold,
  COALESCE(sa.revenue, 0)::numeric(10,2) AS revenue
FROM public.author_books ab
JOIN public.books b ON b.id = ab.book_id
CROSS JOIN public.sellers s
LEFT JOIN LATERAL (
  SELECT
    count(*) AS units_sold,
    SUM(sale.amount) AS revenue
  FROM public.sales sale
  WHERE sale.book_id = ab.book_id
    AND sale.seller_id = s.id
    AND sale.refunded = false
) sa ON true
WHERE s.approval_status = 'approved';

GRANT SELECT ON public.author_book_seller_breakdown TO authenticated;

-- 3. admin_delete_author_account function
CREATE OR REPLACE FUNCTION public.admin_delete_author_account(p_author_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  author_name text;
  caller_is_admin boolean;
BEGIN
  SELECT public.is_admin() INTO caller_is_admin;
  IF NOT caller_is_admin THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  SELECT name INTO author_name FROM public.authors WHERE id = p_author_id;
  IF author_name IS NULL THEN
    RAISE EXCEPTION 'Author not found';
  END IF;

  DELETE FROM public.author_chat_messages WHERE author_id = p_author_id;
  DELETE FROM public.author_notifications WHERE author_id = p_author_id;
  DELETE FROM public.author_payouts WHERE author_id = p_author_id;
  DELETE FROM public.author_books WHERE author_id = p_author_id;
  DELETE FROM public.authors WHERE id = p_author_id;
  DELETE FROM auth.users WHERE id = p_author_id;

  RETURN format('Author %s (%s) deleted successfully', p_author_id, author_name);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_delete_author_account(uuid) TO authenticated;