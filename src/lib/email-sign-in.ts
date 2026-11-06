// SIGN IN WITH AN EMAILED LINK (2026-11-06, owner: "code red"). DECISIONS.md,
// "Anyone who pays can reach their account: emailed sign-in links".
//
// Until today the only way into an account was Google or Discord, and a guest
// Premium checkout (lib/guest-checkout.ts) tied the subscription to the email
// Stripe collected. A buyer who paid with Apple Pay on an iCloud address had
// no Google or Discord account on that address, so they paid and could never
// reach what they paid for. Now any address can sign in by a one-time link
// sent to it, and a guest checkout emails that link the moment it is paid.
//
// HOW THE LINK PROVES IDENTITY. Opening a link sent to an address is the same
// proof Google gives us when it says an address is verified, so a consumed link
// stamps emailVerified. Two token shapes:
//   - an EXISTING account gets a single-use AuthToken row (purpose "login"),
//     30 minutes from the form, 7 days from the paid-checkout email;
//   - an address with no account gets a signed, 30-minute JWT carrying the
//     address, and the account is created only when the link is opened. So
//     typing a stranger's address into the form never creates a row.
// A new account is never created for an admin address (lib/admin-emails.ts),
// the same fence the guest checkout keeps; an existing admin row may sign in,
// since the link proves the inbox.
//
// THE LINK NEVER SIGNS IN ON A GET. It opens /login/email, whose button POSTs
// the token: mail scanners (Outlook Safe Links, corporate gateways) fetch every
// link in an email, and a GET that consumed the token would burn it before the
// person ever clicked. Same rule as lib/premium-winback.ts's claim link.
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./db";
import { authSecret } from "./auth-secret";
import { isAdminEmail } from "./admin-emails";
import { randomBytes } from "node:crypto";
import { sanitizeNextPath } from "./next-param";
import { SITE_URL } from "./site";

// The same AuthToken rows lib/auth.ts's createAuthToken / consumeAuthToken
// write (purpose "login"), written here so this module does not pull in
// lib/auth.ts's next/headers and React cache (tests import it directly).
async function createAuthToken(userId: string, purpose: "login", ttlMs: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await prisma.authToken.create({ data: { token, purpose, userId, expiresAt: new Date(Date.now() + ttlMs) } });
  return token;
}
async function consumeAuthToken(token: string, purpose: "login"): Promise<string | null> {
  const row = await prisma.authToken.findUnique({ where: { token } });
  if (!row || row.purpose !== purpose) return null;
  // Single use: only the request that deletes the row may sign in with it.
  const gone = await prisma.authToken.deleteMany({ where: { id: row.id } });
  if (gone.count === 0) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return row.userId;
}

export const SIGN_IN_LINK_MINUTES = 30;
export const PAID_SIGN_IN_LINK_DAYS = 7;
const NEW_ACCOUNT_TYP = "email-signup";

export function normalizeSignInEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return null;
  // One @, something on each side, a dot in the domain, no spaces or angle brackets.
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) return null;
  return email;
}

/** The URL a sign-in email points at: the confirm page, never the API. */
export function signInLinkUrl(token: string, next: string | null): string {
  const q = new URLSearchParams({ token });
  const safe = sanitizeNextPath(next);
  if (safe) q.set("next", safe);
  return `${SITE_URL}/login/email?${q.toString()}`;
}

/**
 * A token for this address: single-use for an existing account, a signed
 * new-account token otherwise. null when no link may be sent (an admin address
 * with no account).
 */
export async function signInTokenFor(
  email: string,
  ttlMs = SIGN_IN_LINK_MINUTES * 60_000
): Promise<{ token: string; existing: boolean } | null> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (user) return { token: await createAuthToken(user.id, "login", ttlMs), existing: true };
  if (isAdminEmail(email)) return null;
  const token = await new SignJWT({ email, typ: NEW_ACCOUNT_TYP })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${Math.round(ttlMs / 1000)}s`)
    .sign(authSecret());
  return { token, existing: false };
}

/** A sign-in token for an account we already hold (the paid-checkout email). */
export async function signInTokenForUser(userId: string, ttlMs = PAID_SIGN_IN_LINK_DAYS * 86_400_000): Promise<string> {
  return createAuthToken(userId, "login", ttlMs);
}

/**
 * Consume a link. Returns the account to sign in (creating it for a valid
 * new-account token), or null when the link is used, expired or forged.
 */
export async function consumeSignInToken(token: string): Promise<{ userId: string; isNew: boolean } | null> {
  if (!token || token.length > 2048) return null;
  // A JWT has two dots; an AuthToken is 64 hex characters.
  if (!token.includes(".")) {
    const userId = await consumeAuthToken(token, "login");
    if (!userId) return null;
    await prisma.user
      .updateMany({ where: { id: userId, emailVerified: null }, data: { emailVerified: new Date() } })
      .catch(() => {});
    return { userId, isNew: false };
  }
  let email: string | null = null;
  try {
    const { payload } = await jwtVerify(token, authSecret());
    if (payload.typ !== NEW_ACCOUNT_TYP) return null;
    email = normalizeSignInEmail(payload.email);
  } catch {
    return null;
  }
  if (!email) return null;
  // The account may have been created since the link was sent (a guest
  // checkout, a Google sign-in on the same address): sign into it.
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, emailVerified: true } });
  if (existing) {
    if (!existing.emailVerified) {
      await prisma.user.update({ where: { id: existing.id }, data: { emailVerified: new Date() } }).catch(() => {});
    }
    return { userId: existing.id, isNew: false };
  }
  if (isAdminEmail(email)) return null;
  try {
    const user = await prisma.user.create({
      data: {
        email,
        displayName: email.split("@")[0].slice(0, 24) || "Member",
        emailVerified: new Date(),
        signupSource: "email_link",
      },
      select: { id: true },
    });
    return { userId: user.id, isNew: true };
  } catch (e) {
    // A double tap raced us to the unique email: sign into the row it made.
    const again = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (again) return { userId: again.id, isNew: false };
    throw e;
  }
}

/** A display name typed on /login/email: trimmed, single-spaced, 2 to 24 characters, no markup. */
export function cleanDisplayName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/[<>\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 24).trim();
  return name.length >= 2 ? name : null;
}

/**
 * THE NAME STEP. An account made by a link or a guest checkout is named after
 * its address ("m.maglaya"). The first sign-in may replace that placeholder
 * with the name the person typed; a name they (or Google/Discord) already
 * chose is never overwritten.
 */
export async function setNameIfPlaceholder(userId: string, raw: unknown): Promise<void> {
  const name = cleanDisplayName(raw);
  if (!name) return;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, displayName: true } });
  if (!u) return;
  const placeholder = u.email.split("@")[0].slice(0, 24) || "Member";
  if (u.displayName !== placeholder && u.displayName !== "Member") return;
  await prisma.user.update({ where: { id: userId }, data: { displayName: name } });
}
