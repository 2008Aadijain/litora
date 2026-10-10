-- Part D: Add per-seller promo fields for admin control
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS seller_promo_pct numeric DEFAULT 0;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS seller_promo_message text;

-- Part E: Add is_direct_sale column to sales table for tracking non-referral sales
ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_direct_sale boolean DEFAULT false;

-- Allow anon to increment view count (already exists but ensure)
-- Allow public read of approved sellers (already exists)
