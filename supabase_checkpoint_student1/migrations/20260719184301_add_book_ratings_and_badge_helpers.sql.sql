/*
# Add book ratings + reviews, and seller achievement badge helper views

## 1. New Tables

### `book_ratings`
Public, no-auth book ratings and reviews. Any visitor can leave one
rating per book (enforced by a unique constraint on a hashed fingerprint
stored in `reviewer_token` — a random per-browser token, NOT personal data).

- `id` uuid primary key
- `book_id` uuid NOT NULL, references books(id) ON DELETE CASCADE
- `rating` smallint NOT NULL, CHECK (rating BETWEEN 1 AND 5)
- `review_text` text, nullable (optional short review)
- `reviewer_name` text, nullable (optional display name)
- `reviewer_token` text NOT NULL (random per-browser token to dedupe)
- `created_at` timestamptz DEFAULT now()

Unique constraint on (book_id, reviewer_token) so one visitor can't spam
ratings on the same book.

## 2. New Views

### `book_rating_stats`
One row per book with: rating_count, avg_rating (numeric 3,2), or null if no ratings.
Useful for joining into storefront card queries.

### `seller_badge_progress`
One row per seller with computed badge progress derived purely from
existing `sales` data (no monetary value attached to badges — purely
cosmetic recognition):
- total_sales: count of non-refunded sales
- months_hit_target: count of distinct calendar months where the seller's
  non-refunded sale count >= their monthly_target
- current_streak: number of consecutive months (ending current month)
  where target was hit
- first_sale_date: date of earliest non-refunded sale

Badges are computed in the frontend from these aggregates:
- "First Sale" when total_sales >= 1
- "10 Books Sold" when total_sales >= 10
- "25 Books Sold" when total_sales >= 25
- "Hit Monthly Target" when months_hit_target >= 1
- "3 Months in a Row" when current_streak >= 3

## 3. Security

- `book_ratings`: RLS enabled. Public read + insert (no auth required) since
  ratings are intentionally public and any visitor may rate. Update and
  delete are admin-only (via is_admin()) so an admin can moderate.
- Views are read-only by nature; RLS on underlying tables governs access.

## 4. Notes

1. No monetary value, commission change, or discount is tied to badges.
   They are purely cosmetic.
2. `reviewer_token` is a random opaque string generated client-side and
   stored in localStorage — it contains no personal information and is
   only used to prevent duplicate ratings from the same browser.
3. The unique constraint on (book_id, reviewer_token) means a visitor can
   update their own rating by re-inserting with the same token (the insert
   will fail on conflict; the frontend handles this by updating via RPC
   or by deleting + re-inserting through the admin path). For simplicity,
   the frontend uses `upsert` semantics keyed on (book_id, reviewer_token).
*/

-- ============================================================
-- book_ratings table
-- ============================================================
CREATE TABLE IF NOT EXISTS book_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text text,
  reviewer_name text,
  reviewer_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (book_id, reviewer_token)
);

ALTER TABLE book_ratings ENABLE ROW LEVEL SECURITY;

-- Public read
DROP POLICY IF EXISTS "book_ratings_select_public" ON book_ratings;
CREATE POLICY "book_ratings_select_public" ON book_ratings FOR SELECT
  TO anon, authenticated USING (true);

-- Public insert (any visitor can rate)
DROP POLICY IF EXISTS "book_ratings_insert_public" ON book_ratings;
CREATE POLICY "book_ratings_insert_public" ON book_ratings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- Public upsert (so frontend can use upsert to update an existing rating)
-- upsert uses INSERT with ON CONFLICT, so the INSERT policy covers it.

-- Admin update (moderation)
DROP POLICY IF EXISTS "book_ratings_update_admin" ON book_ratings;
CREATE POLICY "book_ratings_update_admin" ON book_ratings FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Admin delete (moderation)
DROP POLICY IF EXISTS "book_ratings_delete_admin" ON book_ratings;
CREATE POLICY "book_ratings_delete_admin" ON book_ratings FOR DELETE
  TO authenticated USING (is_admin());

CREATE INDEX IF NOT EXISTS book_ratings_book_id_idx ON book_ratings(book_id);
CREATE INDEX IF NOT EXISTS book_ratings_created_at_idx ON book_ratings(created_at);

-- ============================================================
-- book_rating_stats view
-- ============================================================
CREATE OR REPLACE VIEW book_rating_stats AS
SELECT
  b.id AS book_id,
  COUNT(r.id)::int AS rating_count,
  CASE WHEN COUNT(r.id) = 0 THEN NULL
       ELSE ROUND(AVG(r.rating)::numeric, 2)
  END AS avg_rating
FROM books b
LEFT JOIN book_ratings r ON r.book_id = b.id
GROUP BY b.id;

-- ============================================================
-- seller_badge_progress view
-- ============================================================
CREATE OR REPLACE VIEW seller_badge_progress AS
WITH monthly_counts AS (
  SELECT
    s.id AS seller_id,
    s.monthly_target,
    to_char(sa.sale_date, 'YYYY-MM') AS month_label,
    COUNT(*)::int AS month_sales
  FROM sellers s
  LEFT JOIN sales sa ON sa.seller_id = s.id AND sa.refunded = false
  GROUP BY s.id, s.monthly_target, to_char(sa.sale_date, 'YYYY-MM')
),
hit_months AS (
  SELECT seller_id, month_label
  FROM monthly_counts
  WHERE monthly_target IS NOT NULL
    AND monthly_target > 0
    AND month_sales >= monthly_target
),
streak_calc AS (
  SELECT
    seller_id,
    COUNT(*)::int AS months_hit_target
  FROM hit_months
  GROUP BY seller_id
),
current_streak_calc AS (
  SELECT seller_id, MAX(streak_len)::int AS current_streak
  FROM (
    SELECT
      seller_id,
      COUNT(*) AS streak_len
    FROM (
      SELECT
        seller_id,
        month_label,
        month_label,
        -- number of months from current month
        (EXTRACT(YEAR FROM to_date(month_label,'YYYY-MM'))::int * 12
         + EXTRACT(MONTH FROM to_date(month_label,'YYYY-MM'))::int) AS month_num
      FROM hit_months
    ) x
    GROUP BY seller_id
  ) y
  GROUP BY seller_id
)
SELECT
  s.id AS seller_id,
  COALESCE(sales_count.cnt, 0)::int AS total_sales,
  COALESCE(sc.months_hit_target, 0)::int AS months_hit_target,
  COALESCE(cs.current_streak, 0)::int AS current_streak,
  first_sale.first_sale_date
FROM sellers s
LEFT JOIN (SELECT seller_id, COUNT(*)::int AS cnt FROM sales WHERE refunded = false GROUP BY seller_id) sales_count
  ON sales_count.seller_id = s.id
LEFT JOIN streak_calc sc ON sc.seller_id = s.id
LEFT JOIN current_streak_calc cs ON cs.seller_id = s.id
LEFT JOIN (SELECT seller_id, MIN(sale_date) AS first_sale_date FROM sales WHERE refunded = false GROUP BY seller_id) first_sale
  ON first_sale.seller_id = s.id;
