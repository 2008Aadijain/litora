/*
# Add payout "paid" flag and admin "read/ack" tracking columns

## Purpose
The admin needs persistent red-dot indicators that survive page reloads
and only clear when the admin takes a concrete action (not just by viewing):

1. Payouts: a seller crosses the $50 owed threshold and becomes "Ready for
   Payout". The red dot must persist until the admin actually marks that
   payout as paid. Currently `payouts` has no "paid" flag — a payout row is
   created when the admin pays a seller, but there is no way to distinguish
   "newly created payout awaiting confirmation" from "acknowledged/done".
   We add a `paid` boolean (default true, since existing rows represent
   already-issued payouts) and an `admin_acknowledged_at` timestamp.

   Going forward, the admin flow becomes: when a seller hits the threshold,
   a payout row is created with `paid = false` (red dot shows). The admin
   marks it paid → `paid = true`, `admin_acknowledged_at = now()` (dot clears).

2. Seller sign-up requests: a `pending` seller needs a dot that clears only
   when the admin approves/rejects. This is already derivable from
   `sellers.approval_status = 'pending'`, so no new column needed — the dot
   is purely a function of pending status. (No change here, documented for
   clarity.)

3. Chat: `chat_messages.read_by_admin` already exists and is the right
   signal — no new column needed.

## 1. Modified Tables

### `payouts`
- ADD `paid` boolean NOT NULL DEFAULT true — existing payouts are already
  paid, so default true preserves current behavior. New payouts created
  by the "ready for payout" flow will set `paid = false` explicitly.
- ADD `admin_acknowledged_at` timestamptz NULL — set when admin marks paid.

## 2. Security
No policy changes. Existing `payouts_update_admin` policy (is_admin() check)
already covers updating the new columns.

## 3. Notes
1. The default of `true` for `paid` is critical: existing payout rows
   represent already-completed payments and must not suddenly appear as
   "unpaid/needs attention" red dots.
2. The frontend admin payout flow will create a payout row with `paid=false`
   when acknowledging a seller has hit the threshold, then set `paid=true`
   when the transfer is actually completed. Alternatively, the admin can
   use a single "Mark as paid" action that creates the payout row with
   `paid=true` directly. The red-dot logic is: a seller has a payout row
   with `paid=false` → show dot; no such row → no dot.
*/
ALTER TABLE payouts
  ADD COLUMN IF NOT EXISTS paid boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS admin_acknowledged_at timestamptz;

CREATE INDEX IF NOT EXISTS payouts_unpaid_idx ON payouts(seller_id) WHERE paid = false;
