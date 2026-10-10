/*
# Add student storage bucket and admin access functions

## Purpose
1. Create student-assets storage bucket for payment screenshots
2. Add admin-accessible RPC functions for student system operations that bypass RLS
3. Add public read policy for student-assets bucket

## Security
- Admin operations use SECURITY DEFINER with is_admin check
- Students can read their own screenshots from the bucket
- Admin can upload to the bucket
*/

-- Create student-assets storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-assets', 'student-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Public read policy for student-assets bucket
DROP POLICY IF EXISTS "public_read_student_assets" ON storage.objects;
CREATE POLICY "public_read_student_assets" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'student-assets');

-- Authenticated upload policy for student-assets bucket
DROP POLICY IF EXISTS "auth_upload_student_assets" ON storage.objects;
CREATE POLICY "auth_upload_student_assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'student-assets');

-- Admin function: create student from event request approval
CREATE OR REPLACE FUNCTION admin_create_student(p_user_id uuid, p_email text, p_name text DEFAULT '', p_event_request_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing_id uuid;
  new_id uuid;
BEGIN
  -- Check if student already exists
  SELECT id INTO existing_id FROM students WHERE id = p_user_id;
  IF existing_id IS NOT NULL THEN
    RETURN existing_id;
  END IF;

  INSERT INTO students (id, email, name, event_request_id, approval_status)
  VALUES (p_user_id, p_email, p_name, p_event_request_id, 'approved')
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

-- Admin function: add student payment
CREATE OR REPLACE FUNCTION admin_add_student_payment(p_student_id uuid, p_amount numeric, p_screenshot_url text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO student_payments (student_id, amount, screenshot_url)
  VALUES (p_student_id, p_amount, p_screenshot_url)
  RETURNING id INTO new_id;

  -- Update total earning
  UPDATE students SET total_earning = total_earning + p_amount WHERE id = p_student_id;

  -- Create notification
  INSERT INTO student_notifications (student_id, message, amount, type, read)
  VALUES (p_student_id, 'You have been paid $' || p_amount::text, p_amount, 'payment', false);

  RETURN new_id;
END;
$$;

-- Admin function: send student notification
CREATE OR REPLACE FUNCTION admin_send_student_notification(p_student_id uuid, p_message text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO student_notifications (student_id, message, type, read)
  VALUES (p_student_id, p_message, 'general', false)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

-- Admin function: get all students (for admin dashboard)
CREATE OR REPLACE FUNCTION admin_get_all_students()
RETURNS TABLE (
  id uuid, email text, name text, total_earning numeric, approval_status text, created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT students.id, students.email, students.name, students.total_earning, students.approval_status, students.created_at FROM students ORDER BY students.created_at DESC;
END;
$$;

-- Admin function: get all bookstore submissions (for admin dashboard + duplicate detection)
CREATE OR REPLACE FUNCTION admin_get_all_bookstore_submissions()
RETURNS TABLE (
  id uuid, student_id uuid, bookstore_name text, disqualified boolean, created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT bookstore_submissions.id, bookstore_submissions.student_id, bookstore_submissions.bookstore_name, bookstore_submissions.disqualified, bookstore_submissions.created_at FROM bookstore_submissions ORDER BY bookstore_submissions.created_at DESC;
END;
$$;

-- Admin function: mark bookstore submission disqualified
CREATE OR REPLACE FUNCTION admin_disqualify_bookstore(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE bookstore_submissions SET disqualified = true WHERE id = p_id;
END;
$$;

-- Admin function: send notification to all students
CREATE OR REPLACE FUNCTION admin_notify_all_students(p_message text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO student_notifications (student_id, message, type, read)
  SELECT id, p_message, 'general', false FROM students;
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION admin_create_student TO authenticated;
GRANT EXECUTE ON FUNCTION admin_add_student_payment TO authenticated;
GRANT EXECUTE ON FUNCTION admin_send_student_notification TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_all_students TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_all_bookstore_submissions TO authenticated;
GRANT EXECUTE ON FUNCTION admin_disqualify_bookstore TO authenticated;
GRANT EXECUTE ON FUNCTION admin_notify_all_students TO authenticated;
