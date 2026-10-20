// GUEST CHECKOUT (2026-10-20, owner: "why has no one signed up for premium
// recently? fix"). DECISIONS.md, "Premium without signing in first".
//
// A signed-out visitor can start Premium straight from /premium: Stripe's
// Checkout collects their email, and when it completes the webhook calls
// guestAccountFor() to tie the subscription to the account with that email,
// creating one if there is none. They then sign in with Google or Discord
// using that email, and the OAuth callback links them to this same account
// (it matches verified emails to existing rows).
//
// WHY LINKING BY AN UNVERIFIED EMAIL IS SAFE HERE: an account can only be
// opened by an OAuth provider that has verified the address (the callback
// refuses unverified ones). Typing someone else's email at Stripe can at most
// give that person Premium the buyer paid for, never access to their account.
// The one exception is an admin address: an account row carrying it would be
// an admin the moment its owner signed in, so a guest checkout never CREATES
// one (lib/admin-emails.ts). An existing admin row is still linked; it is
// already an admin.
import { prisma } from "./db";
import { isAdminEmail } from "./admin-emails";

export interface GuestAccount {
  userId: string;
  created: boolean;
}

/** The account a guest checkout belongs to, by the email Stripe collected; null if none can be used. */
export async function guestAccountFor(rawEmail: string | null | undefined): Promise<GuestAccount | null> {
  const email = (rawEmail ?? "").trim().toLowerCase();
  if (!email || !email.includes("@") || email.length > 254) return null;
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { userId: existing.id, created: false };
  if (isAdminEmail(email)) return null;
  const user = await prisma.user.create({
    data: {
      email,
      displayName: email.split("@")[0].slice(0, 24) || "Member",
      signupSource: "guest_checkout",
    },
    select: { id: true },
  });
  return { userId: user.id, created: true };
}
