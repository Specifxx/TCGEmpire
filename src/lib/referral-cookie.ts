// Shared, client-safe constant: the cookie that carries an inbound referral code
// (?ref=<userId>) from the landing page through the sign-up / OAuth round-trip.
//
// Kept out of lib/referral (which is server-only — it imports next/headers and
// prisma) so the client <ReferralCapture> component can reference the cookie name
// without dragging server-only code into the browser bundle.
export const REFERRAL_COOKIE = "rc_ref";
