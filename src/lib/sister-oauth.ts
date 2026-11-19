import { emailLinkUrl, premiumSite, signEmailLinkCode, type PremiumSite } from "./sister-premium";
import { sanitizeNextPath } from "./next-param";

// "Continue with Discord" ON a sister site (owner, 2026-11-19: "Google OAuth and Discord OAuth … we want to have those login methods
// on basically all of our sites … user accounts are really important for retention"). The sister has no server and no Discord app of
// its own, so the round trip runs through RiftCompare's EXISTING Discord app and its already-registered redirect URI
// (/api/auth/oauth/discord/callback): no new app, no new secret, nothing for the owner to set up.
//
//   sister /account  → GET riftcompare.com/api/sister-premium/discord?site=<key>&next=<path>   (sets state + this cookie)
//   → Discord        → riftcompare.com/api/auth/oauth/discord/callback                           (same checks as a Rift sign-in:
//                       state, verified address only, linked by Discord id then by address: no duplicate accounts)
//   → sister /account/verify#c=<20-minute code>&n=<path>                                        (the emailed link's own door)
//
// It never starts a RiftCompare session: the sister gets the same signed code its emailed link carries, and trades it for its own
// token there. A click that names Discord opens Discord and comes back: not a surprise redirect.
export const SISTER_OAUTH_COOKIE = "oauth_sister_discord";
export const SISTER_OAUTH_NEXT_COOKIE = "oauth_sister_next_discord";

export function sisterForCookie(v: string | undefined): PremiumSite | null {
  return v ? premiumSite(v) : null;
}

export async function sisterReturnUrl(site: PremiumSite, email: string, next: string | undefined): Promise<string> {
  const url = emailLinkUrl(site, await signEmailLinkCode(site, email));
  const n = sanitizeNextPath(next);
  return n ? `${url}&n=${encodeURIComponent(n)}` : url;
}

/** A failed Discord round trip lands back on the sister's sign-in page, which reads ?error=. */
export function sisterFailUrl(site: PremiumSite, code: string): string {
  return `${site.url}/account?error=${encodeURIComponent(code)}`;
}
