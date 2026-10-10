/*
# Private admin-seller chat

## Overview
Adds one-to-one private messaging between the admin and each individual seller.
Each seller sees only their own thread with the admin. The admin sees all threads.

## New Table
- `chat_messages`
  - id (uuid PK)
  - seller_id (uuid FK -> sellers.id) — identifies the thread (one thread per seller)
  - sender (text) — 'admin' or 'seller', who wrote the message
  - message (text) — the message content
  - read_by_admin (boolean, default false) — whether admin has seen this message
  - read_by_seller (boolean, default false) — whether seller has seen this message
  - created_at (timestamptz)

## RPC
- `admin_unread_chat_counts()` — SECURITY DEFINER. Returns one row per seller
  with unread message counts for the admin view. Columns: seller_id, unread_count.
  Executable by authenticated (admin only in practice).

## Security (RLS)
- SELECT: admin sees all messages; a seller sees only messages where seller_id = their own id.
- INSERT: admin can insert any; a seller can insert only into their own thread (seller_id = auth.uid()).
- UPDATE: admin can update any (for read receipts); a seller can update only their own thread's messages.
- DELETE: admin only.
- Uses is_admin() (already defined) for admin checks.
*/

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('admin','seller')),
  message text NOT NULL,
  read_by_admin boolean NOT NULL DEFAULT false,
  read_by_seller boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_seller_id_idx ON public.chat_messages (seller_id);
CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx ON public.chat_messages (created_at);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- SELECT: admin sees all; seller sees own thread
DROP POLICY IF EXISTS "chat_select_admin_or_owner" ON public.chat_messages;
CREATE POLICY "chat_select_admin_or_owner"
ON public.chat_messages FOR SELECT
TO authenticated USING (public.is_admin() OR auth.uid() = seller_id);

-- INSERT: admin inserts any; seller inserts into own thread
DROP POLICY IF EXISTS "chat_insert_admin_or_owner" ON public.chat_messages;
CREATE POLICY "chat_insert_admin_or_owner"
ON public.chat_messages FOR INSERT
TO authenticated WITH CHECK (
  (public.is_admin() AND sender = 'admin')
  OR (auth.uid() = seller_id AND sender = 'seller')
);

-- UPDATE: admin updates any (read receipts); seller updates own thread (read receipts)
DROP POLICY IF EXISTS "chat_update_admin_or_owner" ON public.chat_messages;
CREATE POLICY "chat_update_admin_or_owner"
ON public.chat_messages FOR UPDATE
TO authenticated
USING (public.is_admin() OR auth.uid() = seller_id)
WITH CHECK (public.is_admin() OR auth.uid() = seller_id);

-- DELETE: admin only
DROP POLICY IF EXISTS "chat_delete_admin" ON public.chat_messages;
CREATE POLICY "chat_delete_admin"
ON public.chat_messages FOR DELETE
TO authenticated USING (public.is_admin());

-- RPC: unread counts per seller for admin
CREATE OR REPLACE FUNCTION public.admin_unread_chat_counts()
RETURNS TABLE (seller_id uuid, unread_count bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT seller_id, count(*) AS unread_count
  FROM public.chat_messages
  WHERE sender = 'seller' AND read_by_admin = false
  GROUP BY seller_id;
$$;

GRANT EXECUTE ON FUNCTION public.admin_unread_chat_counts() TO authenticated;
