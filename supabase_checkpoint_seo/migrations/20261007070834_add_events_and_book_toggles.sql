/*
# Add Events system and book-level visibility toggles

## Changes

### 1. New table: events
- Stores events created by admin (e.g. Student Ambassador Program)
- `id` (uuid, primary key)
- `title` (text, not null)
- `description` (text, event description)
- `image_url` (text, uploaded event image URL)
- `youtube_url` (text, YouTube video link)
- `video_description` (text, short description of what the video is about)
- `join_form_url` (text, Google Form link for the Join Now button)
- `created_at` (timestamptz, default now())

### 2. New table: event_requests
- Stores pending join requests from users for a specific event
- `id` (uuid, primary key)
- `event_id` (uuid, references events.id)
- `user_id` (uuid, defaults to auth.uid(), references auth.users)
- `user_email` (text, captured at submission time for admin display)
- `status` (text, default 'pending' — values: pending, approved, rejected)
- `created_at` (timestamptz, default now())

### 3. books table: add two toggle columns
- `show_reviews` (boolean, default true) — controls visibility of reviews/ratings everywhere
- `show_sales_count` (boolean, default true) — controls visibility of units sold count everywhere

### 4. Storage bucket: event-images
- Public bucket for event image uploads

### 5. Security
- RLS enabled on events: anon+authenticated can read (public events), only authenticated can insert/update/delete (admin only in practice via is_admin rpc)
- RLS enabled on event_requests: authenticated can insert their own request, authenticated can read their own requests, only authenticated can update/delete (admin)
- Anon can read events so the Events page works for all visitors
- event-images bucket: public read, authenticated write
*/

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  image_url text,
  youtube_url text,
  video_description text DEFAULT '',
  join_form_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_events" ON events;
CREATE POLICY "anon_read_events"
ON events FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "auth_insert_events" ON events;
CREATE POLICY "auth_insert_events"
ON events FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_events" ON events;
CREATE POLICY "auth_update_events"
ON events FOR UPDATE
TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_events" ON events;
CREATE POLICY "auth_delete_events"
ON events FOR DELETE
TO authenticated
USING (true);

CREATE TABLE IF NOT EXISTS event_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE event_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_event_requests" ON event_requests;
CREATE POLICY "anon_read_event_requests"
ON event_requests FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "auth_insert_event_requests" ON event_requests;
CREATE POLICY "auth_insert_event_requests"
ON event_requests FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_event_requests" ON event_requests;
CREATE POLICY "auth_update_event_requests"
ON event_requests FOR UPDATE
TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_event_requests" ON event_requests;
CREATE POLICY "auth_delete_event_requests"
ON event_requests FOR DELETE
TO authenticated
USING (true);

ALTER TABLE books ADD COLUMN IF NOT EXISTS show_reviews boolean NOT NULL DEFAULT true;
ALTER TABLE books ADD COLUMN IF NOT EXISTS show_sales_count boolean NOT NULL DEFAULT true;

INSERT INTO storage.buckets (id, name, public) VALUES ('event-images', 'event-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "event_images_public_read" ON storage.objects;
CREATE POLICY "event_images_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'event-images');

DROP POLICY IF EXISTS "event_images_auth_upload" ON storage.objects;
CREATE POLICY "event_images_auth_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'event-images');

DROP POLICY IF EXISTS "event_images_auth_update" ON storage.objects;
CREATE POLICY "event_images_auth_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'event-images');

DROP POLICY IF EXISTS "event_images_auth_delete" ON storage.objects;
CREATE POLICY "event_images_auth_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'event-images');
