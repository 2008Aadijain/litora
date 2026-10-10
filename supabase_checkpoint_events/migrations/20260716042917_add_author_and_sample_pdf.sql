/*
# Add author + sample PDF to books, storage bucket for sample PDFs

## Overview
Adds an `author` column to the books table and a `sample_pdf_url` column for storing
a URL to an uploaded sample/preview PDF. Creates a public storage bucket for sample PDFs.

## Modified Tables
- `books`: add `author` (text, nullable) and `sample_pdf_url` (text, nullable).

## Storage
- Create bucket `sample-pdfs` (public) for storing uploaded sample PDF files.
- Policies: anyone can read (public download for customers); only authenticated admin
  can upload/update/delete.

## Security
- No RLS policy changes to books table itself (existing policies cover new columns
  automatically since they are column-agnostic).
- Storage policies restrict uploads to admin only via is_admin() check.
*/

-- Add columns to books
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS author text,
  ADD COLUMN IF NOT EXISTS sample_pdf_url text;

-- Create storage bucket for sample PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('sample-pdfs', 'sample-pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: public read, admin-only write
DROP POLICY IF EXISTS "sample_pdfs_public_read" ON storage.objects;
CREATE POLICY "sample_pdfs_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'sample-pdfs');

DROP POLICY IF EXISTS "sample_pdfs_admin_insert" ON storage.objects;
CREATE POLICY "sample_pdfs_admin_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'sample-pdfs' AND public.is_admin());

DROP POLICY IF EXISTS "sample_pdfs_admin_update" ON storage.objects;
CREATE POLICY "sample_pdfs_admin_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'sample-pdfs' AND public.is_admin())
WITH CHECK (bucket_id = 'sample-pdfs' AND public.is_admin());

DROP POLICY IF EXISTS "sample_pdfs_admin_delete" ON storage.objects;
CREATE POLICY "sample_pdfs_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'sample-pdfs' AND public.is_admin());
