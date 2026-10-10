/*
# Fix seller signup, payout inserts, and add profile_edited column

## Root Causes Fixed:
1. SELLER SIGNUP FAILURE: The `offer_code` column had a UNIQUE constraint, but the signup code 
   inserts `offer_code: ""` (empty string). A second signup with empty string violates the unique 
   constraint, leaving an orphaned auth user. Fix: drop the unique constraint on offer_code, 
   allow NULL, clear existing empty strings to NULL.
2. PAYOUT INSERT FAILURE: The `payouts.remaining_balance` column is NOT NULL with no default. 
   The code wasn't providing it, causing insert failures. Fix: add a default of 0.
3. ONE-TIME PROFILE EDIT: Added `profile_edited` boolean column to sellers table so sellers 
   can edit shop_name/email exactly once, then it becomes read-only.

## Changes:
1. `sellers.offer_code`: drop unique constraint, change to nullable, set default NULL, 
   update existing empty strings to NULL
2. `sellers`: add `profile_edited` boolean column (default false)
3. `payouts.remaining_balance`: add default of 0 so inserts work without explicitly providing it
*/

-- 1. Fix offer_code: remove unique constraint, allow NULL, clear empty strings
ALTER TABLE sellers DROP CONSTRAINT IF EXISTS sellers_offer_code_key;
ALTER TABLE sellers ALTER COLUMN offer_code DROP NOT NULL;
ALTER TABLE sellers ALTER COLUMN offer_code SET DEFAULT NULL;
UPDATE sellers SET offer_code = NULL WHERE offer_code = '';

-- 2. Add profile_edited column for one-time self-edit by seller
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS profile_edited boolean NOT NULL DEFAULT false;

-- 3. Fix payouts: add default for remaining_balance
ALTER TABLE payouts ALTER COLUMN remaining_balance SET DEFAULT 0;
