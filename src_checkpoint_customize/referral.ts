const REFERRAL_COOKIE_KEY = "litora_referral";
const REFERRAL_EXPIRY_DAYS = 30;

export function setReferralCookie(referralCode: string, offerCode?: string) {
  try {
    const data = { ref: referralCode, offer: offerCode || "", ts: Date.now() };
    const expiry = new Date(Date.now() + REFERRAL_EXPIRY_DAYS * 86400000).toUTCString();
    document.cookie = `${REFERRAL_COOKIE_KEY}=${encodeURIComponent(JSON.stringify(data))}; expires=${expiry}; path=/; SameSite=Lax`;
  } catch {}
}

export function getReferralCookie(): { ref: string; offer: string } | null {
  try {
    const match = document.cookie.match(new RegExp(`${REFERRAL_COOKIE_KEY}=([^;]+)`));
    if (!match) return null;
    const data = JSON.parse(decodeURIComponent(match[1]));
    if (!data.ref) return null;
    return { ref: data.ref, offer: data.offer || "" };
  } catch {
    return null;
  }
}

export function clearReferralCookie() {
  try {
    document.cookie = `${REFERRAL_COOKIE_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  } catch {}
}

/**
 * Appends the seller's offer code to a Gumroad checkout URL.
 * Gumroad applies discount codes as a path segment: /l/{productId}/{offerCode}
 * Also adds wanted=true to send the buyer straight to checkout.
 */
export function buildGumroadCheckoutUrl(baseUrl: string, offerCode?: string | null): string {
  if (!offerCode) return baseUrl;
  const [path, query] = baseUrl.split("?");
  const newPath = `${path}/${encodeURIComponent(offerCode)}`;
  if (query) {
    return `${newPath}?${query}&wanted=true`;
  }
  return `${newPath}?wanted=true`;
}
