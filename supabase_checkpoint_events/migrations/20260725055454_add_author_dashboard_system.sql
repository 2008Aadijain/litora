/*
# Author Dashboard & Sales Tracking System

## Overview
Adds a complete author management system mirroring the existing seller system.
Purely additive — no existing tables, columns, or policies are modified.

## New Tables
1. `authors` — author accounts (id = auth.users.id, same pattern as sellers)
   - id (uuid PK, FK to auth.users)
   - name (text)
   - email (text)
   - approval_status (text, default 'approved')
   - created_at (timestamptz)

2. `author_books` — many-to-many junction linking authors to their books
   - author_id (uuid FK -> authors)
   - book_id (uuid FK -> books)
   - PRIMARY KEY (author_id, book_id)

3. `author_payouts` — mirrors payouts table
   - id, author_id, amount, remaining_balance, paid, created_at

4. `author_notifications` — mirrors seller_notifications
   - id, author_id, type, message, amount, read, created_at

5. `author_chat_messages` — mirrors chat_messages
   - id, author_id, sender ('admin'|'author'), message, read_by_admin, read_by_author, created_at

## New Functions (RPCs)
- `author_owed_balance(p_author_id)` — total sales, per-book earnings, payouts, owed balance
- `admin_unread_author_chat_counts()` — per-author unread chat counts for admin
- `author_monthly_sales_count(p_author_id)` — current month sales count

## New Views
- `author_book_stats` — per-book units sold, revenue, earnings for each author

## Security (RLS)
All tables use ownership-scoped RLS (auth.uid() = id/author_id) + admin access via is_admin().
Authors can read their own data; admin can read/write everything.
*/

-- 1. authors table
CREATE TABLE IF NOT EXISTS public.authors (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  approval_status text NOT NULL DEFAULT 'approved',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS authors_email_idx ON public.authors (email);

ALTER TABLE public.authors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authors_select_owner_admin" ON public.authors;
CREATE POLICY "authors_select_owner_admin"
ON public.authors FOR SELECT
TO authenticated USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "authors_insert_admin" ON public.authors;
CREATE POLICY "authors_insert_admin"
ON public.authors FOR INSERT
TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "authors_update_admin" ON public.authors;
CREATE POLICY "authors_update_admin"
ON public.authors FOR UPDATE
TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "authors_delete_admin" ON public.authors;
CREATE POLICY "authors_delete_admin"
ON public.authors FOR DELETE
TO authenticated USING (public.is_admin());

-- 2. author_books junction
CREATE TABLE IF NOT EXISTS public.author_books (
  author_id uuid NOT NULL REFERENCES public.authors(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (author_id, book_id)
);

ALTER TABLE public.author_books ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "author_books_select_owner_admin" ON public.author_books;
CREATE POLICY "author_books_select_owner_admin"
ON public.author_books FOR SELECT
TO authenticated USING (auth.uid() = author_id OR public.is_admin());

DROP POLICY IF EXISTS "author_books_insert_admin" ON public.author_books;
CREATE POLICY "author_books_insert_admin"
ON public.author_books FOR INSERT
TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "author_books_delete_admin" ON public.author_books;
CREATE POLICY "author_books_delete_admin"
ON public.author_books FOR DELETE
TO authenticated USING (public.is_admin());

-- 3. author_payouts table
CREATE TABLE IF NOT EXISTS public.author_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.authors(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  remaining_balance numeric(10,2) NOT NULL,
  paid boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS author_payouts_author_id_idx ON public.author_payouts (author_id);
CREATE INDEX IF NOT EXISTS author_payouts_created_at_idx ON public.author_payouts (created_at);

ALTER TABLE public.author_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "author_payouts_select_owner_admin" ON public.author_payouts;
CREATE POLICY "author_payouts_select_owner_admin"
ON public.author_payouts FOR SELECT
TO authenticated USING (auth.uid() = author_id OR public.is_admin());

DROP POLICY IF EXISTS "author_payouts_insert_admin" ON public.author_payouts;
CREATE POLICY "author_payouts_insert_admin"
ON public.author_payouts FOR INSERT
TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "author_payouts_update_admin" ON public.author_payouts;
CREATE POLICY "author_payouts_update_admin"
ON public.author_payouts FOR UPDATE
TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "author_payouts_delete_admin" ON public.author_payouts;
CREATE POLICY "author_payouts_delete_admin"
ON public.author_payouts FOR DELETE
TO authenticated USING (public.is_admin());

-- 4. author_notifications table
CREATE TABLE IF NOT EXISTS public.author_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.authors(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'payout',
  message text NOT NULL,
  amount numeric(10,2),
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS author_notifications_author_id_idx ON public.author_notifications (author_id);
CREATE INDEX IF NOT EXISTS author_notifications_created_at_idx ON public.author_notifications (created_at);

ALTER TABLE public.author_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "author_notif_select_owner_admin" ON public.author_notifications;
CREATE POLICY "author_notif_select_owner_admin"
ON public.author_notifications FOR SELECT
TO authenticated USING (auth.uid() = author_id OR public.is_admin());

DROP POLICY IF EXISTS "author_notif_insert_admin" ON public.author_notifications;
CREATE POLICY "author_notif_insert_admin"
ON public.author_notifications FOR INSERT
TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "author_notif_update_owner_admin" ON public.author_notifications;
CREATE POLICY "author_notif_update_owner_admin"
ON public.author_notifications FOR UPDATE
TO authenticated USING (auth.uid() = author_id OR public.is_admin())
WITH CHECK (auth.uid() = author_id OR public.is_admin());

DROP POLICY IF EXISTS "author_notif_delete_admin" ON public.author_notifications;
CREATE POLICY "author_notif_delete_admin"
ON public.author_notifications FOR DELETE
TO authenticated USING (public.is_admin());

-- 5. author_chat_messages table
CREATE TABLE IF NOT EXISTS public.author_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.authors(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('admin','author')),
  message text NOT NULL,
  read_by_admin boolean NOT NULL DEFAULT false,
  read_by_author boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS author_chat_messages_author_id_idx ON public.author_chat_messages (author_id);
CREATE INDEX IF NOT EXISTS author_chat_messages_created_at_idx ON public.author_chat_messages (created_at);

ALTER TABLE public.author_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "author_chat_select_admin_or_owner" ON public.author_chat_messages;
CREATE POLICY "author_chat_select_admin_or_owner"
ON public.author_chat_messages FOR SELECT
TO authenticated USING (public.is_admin() OR auth.uid() = author_id);

DROP POLICY IF EXISTS "author_chat_insert_admin_or_owner" ON public.author_chat_messages;
CREATE POLICY "author_chat_insert_admin_or_owner"
ON public.author_chat_messages FOR INSERT
TO authenticated WITH CHECK (
  (public.is_admin() AND sender = 'admin')
  OR (auth.uid() = author_id AND sender = 'author')
);

DROP POLICY IF EXISTS "author_chat_update_admin_or_owner" ON public.author_chat_messages;
CREATE POLICY "author_chat_update_admin_or_owner"
ON public.author_chat_messages FOR UPDATE
TO authenticated
USING (public.is_admin() OR auth.uid() = author_id)
WITH CHECK (public.is_admin() OR auth.uid() = author_id);

DROP POLICY IF EXISTS "author_chat_delete_admin" ON public.author_chat_messages;
CREATE POLICY "author_chat_delete_admin"
ON public.author_chat_messages FOR DELETE
TO authenticated USING (public.is_admin());

-- 6. author_owed_balance RPC
-- Computes total sales across all assigned books, earnings from each book's
-- individual commission rate, total payouts, and owed balance.
CREATE OR REPLACE FUNCTION public.author_owed_balance(p_author_id uuid)
RETURNS TABLE (
  total_sales_amount numeric,
  total_copies_sold bigint,
  total_earnings numeric,
  total_payouts numeric,
  owed_balance numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH author_books_list AS (
    SELECT book_id FROM public.author_books WHERE author_id = p_author_id
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
      COALESCE(SUM(sa.amount * b.commission_pct / 100), 0)::numeric(10,2) AS earnings
    FROM public.sales sa
    JOIN author_books_list abl ON abl.book_id = sa.book_id
    JOIN public.books b ON b.id = sa.book_id
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
$$;

GRANT EXECUTE ON FUNCTION public.author_owed_balance(uuid) TO authenticated;

-- 7. admin_unread_author_chat_counts RPC
CREATE OR REPLACE FUNCTION public.admin_unread_author_chat_counts()
RETURNS TABLE (author_id uuid, unread_count bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT author_id, count(*) AS unread_count
  FROM public.author_chat_messages
  WHERE sender = 'author' AND read_by_admin = false
  GROUP BY author_id;
$$;

GRANT EXECUTE ON FUNCTION public.admin_unread_author_chat_counts() TO authenticated;

-- 8. author_monthly_sales_count RPC
CREATE OR REPLACE FUNCTION public.author_monthly_sales_count(p_author_id uuid)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT count(*)::bigint
  FROM public.sales sa
  JOIN public.author_books ab ON ab.book_id = sa.book_id
  WHERE ab.author_id = p_author_id
    AND sa.refunded = false
    AND date_trunc('month', sa.sale_date) = date_trunc('month', now())
$$;

GRANT EXECUTE ON FUNCTION public.author_monthly_sales_count(uuid) TO authenticated;

-- 9. author_book_stats view — per-book sales/earnings for each author
CREATE OR REPLACE VIEW public.author_book_stats AS
SELECT
  ab.author_id,
  ab.book_id,
  b.title,
  b.commission_pct,
  b.price,
  COALESCE(sa.units_sold, 0)::bigint AS units_sold,
  COALESCE(sa.revenue, 0)::numeric(10,2) AS revenue,
  COALESCE(sa.earnings, 0)::numeric(10,2) AS earnings
FROM public.author_books ab
JOIN public.books b ON b.id = ab.book_id
LEFT JOIN LATERAL (
  SELECT
    count(*) AS units_sold,
    SUM(s.amount) AS revenue,
    SUM(s.amount * b.commission_pct / 100) AS earnings
  FROM public.sales s
  WHERE s.book_id = ab.book_id AND s.refunded = false
) sa ON true;

GRANT SELECT ON public.author_book_stats TO authenticated;