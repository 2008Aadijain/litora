/*
# Add monthly sales count RPC and record_sale RPC

1. New Functions
- `seller_monthly_sales_count(p_seller_id uuid)` — returns the count of non-refunded sales
  for the current calendar month for a given seller. This powers the "books sold this month"
  counter that resets automatically each month.
- `record_sale(p_seller_id uuid, p_book_id uuid, p_amount numeric, p_sale_date date)` — inserts
  a manual sale record into the sales table. Used by admin for testing or webhook-missed sales.
  SECURITY DEFINER so the admin (authenticated) can insert regardless of sales RLS.

2. Security
- Both functions are SECURITY DEFINER so they run with the function owner's privileges.
- `seller_monthly_sales_count` is STABLE (read-only).
- `record_sale` is VOLATILE (writes data).

3. Notes
- The monthly target reset is automatic: the `seller_monthly_sales_count` function counts
  only sales in the current calendar month (date_trunc('month', now())), so the counter
  naturally starts at 0 on the 1st of each month.
- The `apply_monthly_commission_adjustments()` function (already deployed) handles the
  end-of-month bonus/penalty logic. It should be called at the start of each month.
*/

-- Returns count of non-refunded sales for the current calendar month
CREATE OR REPLACE FUNCTION public.seller_monthly_sales_count(p_seller_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT count(*)::integer
  FROM public.sales
  WHERE seller_id = p_seller_id
    AND refunded = false
    AND sale_date >= date_trunc('month', now())::date
    AND sale_date < (date_trunc('month', now()) + interval '1 month')::date;
$function$;

-- Inserts a manual sale record (admin use)
CREATE OR REPLACE FUNCTION public.record_sale(
  p_seller_id uuid,
  p_book_id uuid,
  p_amount numeric,
  p_sale_date date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO public.sales (seller_id, book_id, amount, sale_date, refunded)
  VALUES (p_seller_id, p_book_id, p_amount, p_sale_date, false)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$function$;
