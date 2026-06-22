// Shared referral-cookie name, kept dependency-free so the client component
// (ReferralCapture) and the server module (referral.ts) can both import it
// without dragging next/headers + prisma into the client bundle.
export const REFERRAL_COOKIE = "rc_ref";
