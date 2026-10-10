/*
# Add contact email setting and seller-book assignments

## Changes

### 1. app_settings: add contact_email column
- New column `contact_email` (text, default 'hello@litora.com')
- Allows admin to configure the footer contact email from the admin panel

### 2. New table: seller_books
- Tracks which books a seller is allowed to sell
- `id` (uuid, primary key)
- `seller_id` (uuid, references sellers.id)
- `book_id` (uuid, references books.id)
- `created_at` (timestamptz, default now())
- Unique constraint on (seller_id, book_id) to prevent duplicates

### 3. Security
- RLS enabled on seller_books
- Admin (authenticated) can perform all CRUD operations
- Sellers can read their own assignments
- Anon can read assignments (needed for storefront to filter books by seller)
*/

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS contact_email text NOT NULL DEFAULT 'hello@litora.com';

CREATE TABLE IF NOT EXISTS seller_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(seller_id, book_id)
);

ALTER TABLE seller_books ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_seller_books" ON seller_books;
CREATE POLICY "admin_all_seller_books"
ON seller_books FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "admin_insert_seller_books" ON seller_books;
CREATE POLICY "admin_insert_seller_books"
ON seller_books FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "admin_update_seller_books" ON seller_books;
CREATE POLICY "admin_update_seller_books"
ON seller_books FOR UPDATE
TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_delete_seller_books" ON seller_books;
CREATE POLICY "admin_delete_seller_books"
ON seller_books FOR DELETE
TO authenticated
USING (true);

DROP POLICY IF EXISTS "anon_read_seller_books" ON seller_books;
CREATE POLICY "anon_read_seller_books"
ON seller_books FOR SELECT
TO anon, authenticated
USING (true);
