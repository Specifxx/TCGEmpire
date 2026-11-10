// DEXCOMPARE PREMIUM IS A REGISTERED RIFTCOMPARE PREMIUM ACCOUNT (2026-11-10,
// owner: "one account for both … whatever's easier"). DECISIONS.md, "DexCompare
// Premium". DexCompare has no accounts, no Stripe and no database, so it holds
// nothing: the member signs in HERE (the ordinary RiftCompare session), this
// file signs a long-lived "premium session" token for that address and the
// browser hands it back to DexCompare, which keeps it in localStorage and asks
// /api/sister-premium/* what it is worth. Every call re-reads the account, so
// a lapsed subscription stops working at once and no entitlement is copied.
//
// The token is an EdDSA JWT signed with the same key as the sister sign-in
// links (lib/sister-sign-in.ts) but carries `use: "premium-session"`, which a
// sign-in link never has, so one can never stand in for the other. It names
// ONE site (aud) and an address (sub); it grants nothing by itself.
import { SignJWT, createRemoteJWKSet, jwtVerify } from "jose";
import { sisterKeyPair, SISTER_SIGN_IN_ISSUER } from "./sister-sign-in";
import { isPremium } from "./premium";
import { prisma } from "./db";

export interface PremiumSite {
  key: string;
  name: string;
  /** Canonical origin, no trailing slash. */
  url: string;
}

/** Sites whose members can use their RiftCompare Premium there. Add a site here only once it has the perks. */
export const SISTER_PREMIUM_SITES: PremiumSite[] = [{ key: "dex", name: "DexCompare", url: "https://dexcompare.app" }];

export const PREMIUM_SESSION_DAYS = 60;
const KID = "sister-sign-in-1";

export function premiumSite(key: unknown): PremiumSite | null {
  return SISTER_PREMIUM_SITES.find((s) => s.key === key) ?? null;
}

/** The premium site whose browser origin this is (canonical origin or its www twin, https, no port). */
export function premiumSiteForOrigin(origin: string | null): PremiumSite | null {
  if (!origin) return null;
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:" || u.port) return null;
    const bare = u.hostname.toLowerCase().replace(/^www\./, "");
    return SISTER_PREMIUM_SITES.find((s) => new URL(s.url).hostname === bare) ?? null;
  } catch {
    return null;
  }
}

export function premiumCors(origin: string | null): Record<string, string> {
  if (!origin || !premiumSiteForOrigin(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function signPremiumSession(site: PremiumSite, email: string): Promise<string> {
  return new SignJWT({ use: "premium-session" })
    .setProtectedHeader({ alg: "EdDSA", kid: KID })
    .setIssuer(SISTER_SIGN_IN_ISSUER)
    .setAudience(site.url)
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime(`${PREMIUM_SESSION_DAYS}d`)
    .sign(sisterKeyPair().privateKey);
}

/** The address a valid premium-session token for `site` names, or null. */
export async function verifyPremiumSession(token: unknown, site: PremiumSite): Promise<string | null> {
  if (typeof token !== "string" || token.length < 20 || token.length > 4096) return null;
  try {
    const { payload } = await jwtVerify(token, sisterKeyPair().publicKey, { issuer: SISTER_SIGN_IN_ISSUER, audience: site.url, algorithms: ["EdDSA"] });
    if (payload.use !== "premium-session" || typeof payload.sub !== "string") return null;
    const email = payload.sub.trim().toLowerCase();
    return email.length >= 3 && email.length <= 254 ? email : null;
  } catch {
    return null;
  }
}

export interface PremiumStatus {
  email: string;
  premium: boolean;
  until: string | null;
  verified: boolean;
}

/** Re-reads the account: Premium right now (the same isPremium the whole site uses), never copied. */
export async function premiumStatusFor(email: string): Promise<PremiumStatus | null> {
  const u = await prisma.user.findUnique({
    where: { email },
    select: { premiumUntil: true, premiumTier: true, premiumTierFloor: true, isAdmin: true, emailVerified: true },
  });
  if (!u) return null;
  return { email, premium: isPremium(u, "premium"), until: u.premiumUntil ? u.premiumUntil.toISOString() : null, verified: !!u.emailVerified };
}

/** Members get more price alerts than the free 25, and restock alerts. */
export const MEMBER_MAX_ALERTS = 200;

export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 2)}${"*".repeat(Math.max(1, Math.min(6, local.length - 2)))}@${domain}`;
}

// ─── Signing in ON the sister site (owner, 2026-11-10: "I don't want them to go into the RiftCompare website to sign in … it needs to be
// sign in via DexCompare"). DECISIONS.md, "DexCompare signs in on DexCompare". The member never visits riftcompare.com: DexCompare shows
// Google's own sign-in button and an email-link form, and its browser calls these routes. Nothing secret lives on DexCompare.
//   • Google: Google Identity Services hands DexCompare's page an ID token (a JWT Google signs, audience = DexCompare's OAuth client id,
//     a public value). We check it against Google's published keys, so a token minted for any other app is refused.
//   • Email: we mail a 20-minute link from DexCompare's own sender (lib/sister-alerts/send.ts). The link lands on DexCompare, whose page
//     hands the code back; a valid code proves the inbox.
// Either way the account is the ordinary RiftCompare account for that verified address (found, linked or created), so the admin pages,
// Stripe and isPremium see one member.

/** Each premium site's own Google OAuth client id (public): an env override, else the one registered for it. */
export function googleClientIdFor(site: PremiumSite, env: Record<string, string | undefined> = process.env): string | null {
  const v = env[`${site.key.toUpperCase()}_GOOGLE_CLIENT_ID`]?.trim();
  return v ? v : null;
}

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
}

/** A Google ID token minted for this site's client, with a Google-verified address; else null. */
export async function verifyGoogleCredential(credential: unknown, clientId: string): Promise<GoogleIdentity | null> {
  if (typeof credential !== "string" || credential.length < 100 || credential.length > 8192) return null;
  try {
    const { payload } = await jwtVerify(credential, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    });
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const verified = payload.email_verified === true || payload.email_verified === "true";
    if (!verified || !email || typeof payload.sub !== "string") return null;
    return {
      sub: payload.sub,
      email,
      name: typeof payload.name === "string" ? payload.name : null,
      picture: typeof payload.picture === "string" ? payload.picture : null,
    };
  } catch {
    return null;
  }
}

export const EMAIL_LINK_MINUTES = 20;

export async function signEmailLinkCode(site: PremiumSite, email: string): Promise<string> {
  return new SignJWT({ use: "premium-email-link" })
    .setProtectedHeader({ alg: "EdDSA", kid: KID })
    .setIssuer(SISTER_SIGN_IN_ISSUER)
    .setAudience(site.url)
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime(`${EMAIL_LINK_MINUTES}m`)
    .sign(sisterKeyPair().privateKey);
}

export async function verifyEmailLinkCode(code: unknown, site: PremiumSite): Promise<string | null> {
  if (typeof code !== "string" || code.length < 20 || code.length > 4096) return null;
  try {
    const { payload } = await jwtVerify(code, sisterKeyPair().publicKey, { issuer: SISTER_SIGN_IN_ISSUER, audience: site.url, algorithms: ["EdDSA"] });
    if (payload.use !== "premium-email-link" || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}

/** The sign-in link the email carries: on the sister site, the code in the fragment (never sent to a server log). */
export function emailLinkUrl(site: PremiumSite, code: string): string {
  return `${site.url}/account/verify#c=${encodeURIComponent(code)}`;
}

export const EMAIL_SHAPE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/**
 * The RiftCompare account for an address its owner just proved (Google said so, or they opened the emailed link): linked by Google id
 * first, then by address, else created. Same rules as the OAuth callback: an address only enters the system verified.
 */
export async function memberFor(email: string, google?: GoogleIdentity | null): Promise<{ id: string; email: string; isNew: boolean }> {
  if (google) {
    const byGoogle = await prisma.user.findFirst({ where: { googleId: google.sub }, select: { id: true, email: true } });
    if (byGoogle) return { ...byGoogle, isNew: false };
  }
  const byEmail = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, emailVerified: true, googleId: true } });
  if (byEmail) {
    await prisma.user.update({
      where: { id: byEmail.id },
      data: {
        emailVerified: byEmail.emailVerified ?? new Date(),
        ...(google && !byEmail.googleId ? { googleId: google.sub } : {}),
        lastLoginAt: new Date(),
      },
    });
    return { id: byEmail.id, email: byEmail.email, isNew: false };
  }
  const created = await prisma.user.create({
    data: {
      email,
      displayName: (google?.name ?? email.split("@")[0]!).slice(0, 24),
      emailVerified: new Date(),
      ...(google ? { googleId: google.sub, avatarUrl: google.picture } : {}),
      lastLoginAt: new Date(),
    },
    select: { id: true, email: true },
  });
  return { ...created, isNew: true };
}
