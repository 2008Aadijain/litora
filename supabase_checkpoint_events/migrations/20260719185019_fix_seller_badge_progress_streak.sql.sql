/*
# Fix seller_badge_progress current_streak calculation

Replaces the placeholder streak calc with a correct consecutive-month
count using a RECURSIVE CTE. For each seller, finds the most recent month
they hit target, then counts backwards how many consecutive months ending
at that month are also target-hits.

No table or security changes — only the view definition is replaced.
*/

CREATE OR REPLACE VIEW seller_badge_progress AS
WITH RECURSIVE
hit_months AS (
  SELECT
    s.id AS seller_id,
    to_char(sa.sale_date, 'YYYY-MM') AS month_label,
    (EXTRACT(YEAR FROM sa.sale_date)::int * 12 + EXTRACT(MONTH FROM sa.sale_date)::int) AS month_num
  FROM sellers s
  JOIN sales sa ON sa.seller_id = s.id AND sa.refunded = false
  WHERE s.monthly_target IS NOT NULL AND s.monthly_target > 0
  GROUP BY s.id, to_char(sa.sale_date, 'YYYY-MM'), (EXTRACT(YEAR FROM sa.sale_date)::int * 12 + EXTRACT(MONTH FROM sa.sale_date)::int)
  HAVING COUNT(*) >= (SELECT monthly_target FROM sellers WHERE id = s.id)
),
hit_with_max AS (
  SELECT seller_id, month_num, MAX(month_num) OVER (PARTITION BY seller_id) AS max_month
  FROM hit_months
),
streak_rec(seller_id, month_num, len) AS (
  SELECT seller_id, month_num, 1
  FROM hit_with_max
  WHERE month_num = max_month
  UNION ALL
  SELECT h.seller_id, h.month_num, sr.len + 1
  FROM hit_with_max h
  JOIN streak_rec sr ON sr.seller_id = h.seller_id
    AND h.month_num = sr.month_num - 1
),
streak_agg AS (
  SELECT seller_id, MAX(len)::int AS current_streak
  FROM streak_rec
  GROUP BY seller_id
),
months_hit AS (
  SELECT seller_id, COUNT(*)::int AS months_hit_target
  FROM hit_months
  GROUP BY seller_id
),
sales_count AS (
  SELECT seller_id, COUNT(*)::int AS cnt
  FROM sales WHERE refunded = false
  GROUP BY seller_id
),
first_sale AS (
  SELECT seller_id, MIN(sale_date) AS first_sale_date
  FROM sales WHERE refunded = false
  GROUP BY seller_id
)
SELECT
  s.id AS seller_id,
  COALESCE(sc.cnt, 0)::int AS total_sales,
  COALESCE(mh.months_hit_target, 0)::int AS months_hit_target,
  COALESCE(st.current_streak, 0)::int AS current_streak,
  fs.first_sale_date
FROM sellers s
LEFT JOIN sales_count sc ON sc.seller_id = s.id
LEFT JOIN months_hit mh ON mh.seller_id = s.id
LEFT JOIN streak_agg st ON st.seller_id = s.id
LEFT JOIN first_sale fs ON fs.seller_id = s.id;
