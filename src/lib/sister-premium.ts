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
import { SignJWT, jwtVerify } from "jose";
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
