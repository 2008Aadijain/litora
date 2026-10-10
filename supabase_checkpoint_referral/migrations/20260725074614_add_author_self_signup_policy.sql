/*
# Allow self-signup for authors

Additive: adds a new INSERT policy alongside the existing admin-only one.
Mirrors the seller pattern: `sellers_insert_self` allows auth.uid() = id.
This lets the BecomeAuthorPage form create a real author account.
*/

DROP POLICY IF EXISTS "authors_insert_self" ON public.authors;
CREATE POLICY "authors_insert_self"
ON public.authors FOR INSERT
TO authenticated WITH CHECK (auth.uid() = id);

-- Also allow self-update of own name/email (not approval_status — admin controls that)
DROP POLICY IF EXISTS "authors_update_self_name_email" ON public.authors;
CREATE POLICY "authors_update_self_name_email"
ON public.authors FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);