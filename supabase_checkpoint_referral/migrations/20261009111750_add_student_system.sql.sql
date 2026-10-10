/*
# Add Student Ambassador System

## Purpose
Creates the full student tracking system: student accounts, bookstore name submissions with duplicate disqualification, manual payments with optional screenshot, student notifications, and admin-editable terms content.

## New Tables

1. **students** — Student accounts linked to auth.users
   - id (uuid, PK, references auth.users)
   - email (text)
   - name (text)
   - total_earning (numeric, default 0) — admin can add to this
   - approval_status (text, default 'approved') — set when created from event request approval
   - event_request_id (uuid, nullable — links back to the event request that created this student)
   - created_at (timestamptz)

2. **bookstore_submissions** — Bookstore names submitted by students
   - id (uuid, PK)
   - student_id (uuid, references students.id)
   - bookstore_name (text, not null)
   - disqualified (boolean, default false)
   - created_at (timestamptz)
   - Unique constraint on (student_id, bookstore_name) to prevent same student submitting same name twice

3. **student_payments** — Manual payments recorded by admin
   - id (uuid, PK)
   - student_id (uuid, references students.id)
   - amount (numeric, not null)
   - screenshot_url (text, nullable)
   - created_at (timestamptz)

4. **student_notifications** — Notifications for students
   - id (uuid, PK)
   - student_id (uuid, references students.id)
   - message (text, not null)
   - amount (numeric, nullable)
   - type (text, default 'general')
   - read (boolean, default false)
   - created_at (timestamptz)

## Modified Tables

5. **app_settings** — Add terms_content column for admin-editable Terms & Conditions
   - New column: terms_content (text, nullable)

6. **event_requests** — Add student_id column to link approved requests to student accounts
   - New column: student_id (uuid, nullable, references students.id)

## Security (RLS)
- All new tables have RLS enabled
- students: owner-scoped (student can read/update own row), admin has full access via service role
- bookstore_submissions: owner-scoped through students table
- student_payments: owner-scoped (student reads own payments)
- student_notifications: owner-scoped (student reads/updates own notifications)
- app_settings: already has existing policies, new column inherits those
- event_requests: already has existing policies

## Important Notes
1. Students are created when admin approves an event request — the auth user already exists from the signup flow
2. Bookstore name disqualification is handled at the application level (checking for duplicates across all students)
3. Admin uses the service role key (via edge functions) or existing admin RLS for privileged operations
4. Student login uses standard Supabase auth — students sign up on the events page flow, then get linked when approved
*/

-- 1. Students table
CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text DEFAULT '',
  total_earning numeric DEFAULT 0,
  approval_status text DEFAULT 'approved',
  event_request_id uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_student" ON students;
CREATE POLICY "select_own_student" ON students FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_student" ON students;
CREATE POLICY "update_own_student" ON students FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_student" ON students;
CREATE POLICY "insert_own_student" ON students FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

-- 2. Bookstore submissions table
CREATE TABLE IF NOT EXISTS bookstore_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  bookstore_name text NOT NULL,
  disqualified boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(student_id, bookstore_name)
);

ALTER TABLE bookstore_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_bookstore_submissions" ON bookstore_submissions;
CREATE POLICY "select_own_bookstore_submissions" ON bookstore_submissions FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM students WHERE students.id = bookstore_submissions.student_id AND students.id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_bookstore_submissions" ON bookstore_submissions;
CREATE POLICY "insert_own_bookstore_submissions" ON bookstore_submissions FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM students WHERE students.id = bookstore_submissions.student_id AND students.id = auth.uid()));

DROP POLICY IF EXISTS "update_own_bookstore_submissions" ON bookstore_submissions;
CREATE POLICY "update_own_bookstore_submissions" ON bookstore_submissions FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM students WHERE students.id = bookstore_submissions.student_id AND students.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM students WHERE students.id = bookstore_submissions.student_id AND students.id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_bookstore_submissions" ON bookstore_submissions;
CREATE POLICY "delete_own_bookstore_submissions" ON bookstore_submissions FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM students WHERE students.id = bookstore_submissions.student_id AND students.id = auth.uid()));

-- 3. Student payments table
CREATE TABLE IF NOT EXISTS student_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  screenshot_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE student_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_student_payments" ON student_payments;
CREATE POLICY "select_own_student_payments" ON student_payments FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM students WHERE students.id = student_payments.student_id AND students.id = auth.uid()));

-- 4. Student notifications table
CREATE TABLE IF NOT EXISTS student_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  message text NOT NULL,
  amount numeric,
  type text DEFAULT 'general',
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE student_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_student_notifications" ON student_notifications;
CREATE POLICY "select_own_student_notifications" ON student_notifications FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM students WHERE students.id = student_notifications.student_id AND students.id = auth.uid()));

DROP POLICY IF EXISTS "update_own_student_notifications" ON student_notifications;
CREATE POLICY "update_own_student_notifications" ON student_notifications FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM students WHERE students.id = student_notifications.student_id AND students.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM students WHERE students.id = student_notifications.student_id AND students.id = auth.uid()));

-- 5. Add terms_content column to app_settings
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_settings' AND column_name = 'terms_content') THEN
    ALTER TABLE app_settings ADD COLUMN terms_content text;
  END IF;
END $$;

-- 6. Add student_id column to event_requests
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_requests' AND column_name = 'student_id') THEN
    ALTER TABLE event_requests ADD COLUMN student_id uuid REFERENCES students(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_bookstore_submissions_student ON bookstore_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_bookstore_submissions_name ON bookstore_submissions(bookstore_name);
CREATE INDEX IF NOT EXISTS idx_student_payments_student ON student_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_student_notifications_student ON student_notifications(student_id);
CREATE INDEX IF NOT EXISTS idx_event_requests_student ON event_requests(student_id);
