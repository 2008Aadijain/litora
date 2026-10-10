-- Update existing approved sellers with QR code URLs and referral URLs
UPDATE sellers SET 
  qr_referral_url = 'https://litora.app/?ref=' || referral_code,
  view_count = 0
WHERE approval_status = 'approved' AND qr_referral_url IS NULL;
