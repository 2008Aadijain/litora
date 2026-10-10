/*
# Add admin_exists() public RPC

## Why
The admin login page needs to know whether any admin account has been created yet,
to show "Create Admin Account" (setup) vs "Admin Login". The `admins` table is locked
behind RLS (admin-only SELECT), so an unauthenticated visitor cannot query it directly.

## Changes
- Add `admin_exists()` function: SECURITY DEFINER, returns boolean (true if any row in admins).
- Grant EXECUTE to anon and authenticated so the public login page can call it.

## Security
The function only reveals a boolean (does an admin exist), not any admin details.
This is safe to expose publicly — it's equivalent to knowing whether the app has been set up.
*/

CREATE OR REPLACE FUNCTION public.admin_exists()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admins);
$$;

GRANT EXECUTE ON FUNCTION public.admin_exists() TO anon, authenticated;
