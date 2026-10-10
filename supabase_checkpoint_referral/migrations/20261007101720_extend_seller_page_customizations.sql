/*
# Extend seller_page_customizations with card bg, font, font color, custom poster

## Changes

### 1. seller_page_customizations table: add 4 new columns
- `card_background_color` (text, nullable — custom background for book listing cards, null = default #ffffff)
- `font_family` (text, nullable — custom font family for page text, null = default Inter/serif)
- `font_color` (text, nullable — custom main text color, null = default #1a1a2e)
- `custom_poster_url` (text, nullable — admin-uploaded custom poster image URL for this seller's dashboard QR section, null = no custom poster shown)

### 2. Security
- No new RLS policies needed — existing policies already cover all columns on this table.
- The seller-assets bucket already has authenticated INSERT/UPDATE and public SELECT policies.

### 3. Important notes
- All new fields are nullable so existing rows and sellers without customization continue using defaults.
- custom_poster_url is only shown on the seller's dashboard when present — absent = third QR option hidden.
*/
ALTER TABLE seller_page_customizations
  ADD COLUMN IF NOT EXISTS card_background_color text,
  ADD COLUMN IF NOT EXISTS font_family text,
  ADD COLUMN IF NOT EXISTS font_color text,
  ADD COLUMN IF NOT EXISTS custom_poster_url text;
