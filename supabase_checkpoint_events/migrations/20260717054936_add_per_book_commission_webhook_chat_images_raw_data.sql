/*
# Per-book commission, Gumroad webhook support, chat images, raw data export

## Overview
This migration adds per-book commission percentages, dynamic average commission
calculation per seller, Gumroad webhook sale tracking (with refund handling), image
attachments in admin-seller chat, and a seller-deletion RPC.

## 1. New Columns

### books table
- `commission_pct` (numeric(5,2), default 30) — per-book commission percentage set by admin.
- `gumroad_permalink` (text, nullable, unique) — Gumroad product permalink/product_id for webhook matching.

### sellers table
- `commission_adjustment_pct` (numeric(5,2), default 0) — bonus/penalty adjustment applied
  ON TOP of the dynamically-calculated average commission. Positive = bonus, negative = penalty.

### sales table
- `refunded` (boolean, default false) — refunded sales excluded from all calculations.
- `gumroad_sale_id` (text, nullable, unique) — Gumroad sale ID for idempotency and refund matching.

### chat_messages table
- `image_url` (text, nullable) — URL of an attached image.

## 2. New View: seller_commission_stats
Calculates dynamic average commission per seller from non-refunded sales. For each
non-refunded sale, uses the book's commission_pct (falls back to seller's commission_pct
if book is null or has no commission). Returns: seller_id, avg_commission_pct, total_copies_sold.

## 3. Updated RPC: apply_monthly_commission_adjustments
Now adjusts commission_adjustment_pct (the adjustment on top of the average) instead of
modifying commission_pct. Target hit → add bonus_margin_pct to adjustment. Target missed →
subtract penalty_margin_pct from adjustment. Base average commission is never touched.

## 4. New RPC: seller_avg_commission
Returns the dynamic average commission, total copies sold, adjustment, and final commission
for a given seller_id.

## 5. New RPC: delete_seller_account
Admin-only. Permanently deletes a seller's auth.users entry (cascades to all related tables),
freeing the email for re-registration.

## 6. Storage Bucket: chat-images
Public bucket for chat image attachments. Public read, authenticated write.

## 7. Security
- No RLS changes needed; webhook uses service role key (bypasses RLS).
- All existing policies remain intact.
*/

-- ============================================================
-- 1. Add columns to books
-- ============================================================
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS commission_pct numeric(5,2) NOT NULL DEFAULT 30 CHECK (commission_pct >= 0),
  ADD COLUMN IF NOT EXISTS gumroad_permalink text;

CREATE UNIQUE INDEX IF NOT EXISTS books_gumroad_permalink_uniq ON public.books (gumroad_permalink) WHERE gumroad_permalink IS NOT NULL;

-- ============================================================
-- 2. Add columns to sellers
-- ============================================================
ALTER TABLE public.sellers
  ADD COLUMN IF NOT EXISTS commission_adjustment_pct numeric(5,2) NOT NULL DEFAULT 0;

-- ============================================================
-- 3. Add columns to sales
-- ============================================================
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS refunded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gumroad_sale_id text;

CREATE UNIQUE INDEX IF NOT EXISTS sales_gumroad_sale_id_uniq ON public.sales (gumroad_sale_id) WHERE gumroad_sale_id IS NOT NULL;

-- ============================================================
-- 4. Add image_url to chat_messages
-- ============================================================
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS image_url text;

-- ============================================================
-- 5. View: seller_commission_stats
-- ============================================================
CREATE OR REPLACE VIEW public.seller_commission_stats AS
SELECT
  s.id AS seller_id,
  COALESCE(
    AVG(COALESCE(b.commission_pct, s.commission_pct)),
    s.commission_pct
  ) AS avg_commission_pct,
  COUNT(sa.id) AS total_copies_sold
FROM public.sellers s
LEFT JOIN public.sales sa ON sa.seller_id = s.id AND sa.refunded = false
LEFT JOIN public.books b ON b.id = sa.book_id
GROUP BY s.id, s.commission_pct;

GRANT SELECT ON public.seller_commission_stats TO authenticated;

-- ============================================================
-- 6. RPC: seller_avg_commission
-- ============================================================
CREATE OR REPLACE FUNCTION public.seller_avg_commission(p_seller_id uuid)
RETURNS TABLE (avg_commission_pct numeric, total_copies_sold bigint, adjustment_pct numeric, final_commission_pct numeric)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    COALESCE(stats.avg_commission_pct, s.commission_pct) AS avg_commission_pct,
    COALESCE(stats.total_copies_sold, 0) AS total_copies_sold,
    s.commission_adjustment_pct AS adjustment_pct,
    GREATEST(0, LEAST(100,
      COALESCE(stats.avg_commission_pct, s.commission_pct) + s.commission_adjustment_pct
    )) AS final_commission_pct
  FROM public.sellers s
  LEFT JOIN public.seller_commission_stats stats ON stats.seller_id = s.id
  WHERE s.id = p_seller_id;
$$;

GRANT EXECUTE ON FUNCTION public.seller_avg_commission(uuid) TO authenticated;

-- ============================================================
-- 7. Updated RPC: apply_monthly_commission_adjustments
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
  old_adj numeric(5,2);
  new_adj numeric(5,2);
  reason text;
  adjusted_count integer := 0;
  skipped_count integer := 0;
BEGIN
  FOR seller_rec IN
    SELECT id, commission_pct, monthly_target, bonus_margin_pct, penalty_margin_pct,
           last_adjusted_month, commission_adjustment_pct
    FROM public.sellers
    WHERE approval_status = 'approved'
  LOOP
    IF seller_rec.last_adjusted_month = current_month_label THEN
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    SELECT count(*) INTO prev_month_sales_count
    FROM public.sales
    WHERE seller_id = seller_rec.id
      AND refunded = false
      AND sale_date >= prev_month
      AND sale_date < date_trunc('month', now_ts)::date;

    old_adj := seller_rec.commission_adjustment_pct;

    IF prev_month_sales_count >= seller_rec.monthly_target THEN
      new_adj := old_adj + seller_rec.bonus_margin_pct;
      reason := 'target_hit';
    ELSE
      new_adj := old_adj - seller_rec.penalty_margin_pct;
      reason := 'target_missed';
    END IF;

    UPDATE public.sellers
    SET commission_adjustment_pct = new_adj,
        last_adjusted_month = current_month_label,
        commission_adjusted_at = now_ts
    WHERE id = seller_rec.id;

    INSERT INTO public.commission_history (seller_id, old_pct, new_pct, reason, month_label)
    VALUES (seller_rec.id, old_adj, new_adj, reason, prev_month_label);

    adjusted_count := adjusted_count + 1;
  END LOOP;

  RETURN format('Processed %s sellers (%s skipped, already adjusted). Month: %s adjustments for %s performance.',
    adjusted_count, skipped_count, current_month_label, prev_month_label);
END;
$$;

-- ============================================================
-- 8. RPC: delete_seller_account
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_seller_account(p_seller_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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

  DELETE FROM auth.users WHERE id = p_seller_id;

  RETURN format('Seller %s (%s) deleted successfully', p_seller_id, seller_email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_seller_account(uuid) TO authenticated;

-- ============================================================
-- 9. Storage bucket for chat images
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-images', 'chat-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "chat_images_public_read" ON storage.objects;
CREATE POLICY "chat_images_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'chat-images');

DROP POLICY IF EXISTS "chat_images_auth_insert" ON storage.objects;
CREATE POLICY "chat_images_auth_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-images');

DROP POLICY IF EXISTS "chat_images_auth_update" ON storage.objects;
CREATE POLICY "chat_images_auth_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'chat-images')
WITH CHECK (bucket_id = 'chat-images');

DROP POLICY IF EXISTS "chat_images_auth_delete" ON storage.objects;
CREATE POLICY "chat_images_auth_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'chat-images');
