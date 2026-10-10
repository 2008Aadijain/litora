/*
# Fix orphaned student auth accounts

## Purpose
Two auth users were created through the student signup flow but no matching `students` row was inserted (bug in the original signup code). This migration creates the missing student profile rows so those users can log in immediately.

## What it does
1. Checks for auth users that have no matching row in the `students` table
2. Inserts a student row for each orphaned auth user
*/

INSERT INTO students (id, email, name, approval_status)
SELECT au.id, au.email, '', 'approved'
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = au.id)
AND au.id IN (
  SELECT au2.id FROM auth.users au2
  LEFT JOIN sellers sl ON sl.id = au2.id
  LEFT JOIN authors ar ON ar.id = au2.id
  WHERE sl.id IS NULL AND ar.id IS NULL
)
ON CONFLICT (id) DO NOTHING;
