/*
# Add category column to books table

1. New Columns
- `books.category` (text, nullable) — optional category/genre for each book.
  Used by the homepage filter bar to auto-populate the category dropdown
  from the distinct values present in the table.

2. Notes
- Additive only: nullable, no default, no NOT NULL constraint.
- Existing rows get NULL; they simply don't appear in the category filter
  until a category is set. The default "All Categories" filter shows all books.
- No existing column, type, or constraint is modified or removed.
- Books table already has RLS enabled with public read policies, so no
  policy changes are needed.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'books' AND column_name = 'category'
  ) THEN
    ALTER TABLE books ADD COLUMN category text;
  END IF;
END $$;