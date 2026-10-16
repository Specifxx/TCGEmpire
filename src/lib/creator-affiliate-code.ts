// Creator affiliate codes: the rules every surface shares (2026-10-16, owner:
// "Riftbound creators can apply to RiftCompare for a code that they can share to
// their audience. That code can be applied when you subscribe to RiftCompare
// Premium. It'll give you 20% off… so we know how to give them their 20%
// commission"). DECISIONS.md, "Creator codes: 20% off, 20% commission".
//
// Client-safe: no database, no Stripe. lib/creator-affiliate.ts is the server half.

/** What a subscriber saves with a creator's code, on every payment while subscribed. */
export const AFFILIATE_PERCENT_OFF = 20;
/** The creator's share of what each referred subscriber actually pays. */
export const AFFILIATE_COMMISSION_PERCENT = 20;
/** The cookie that carries a code from the creator's link to checkout. */
export const AFFILIATE_COOKIE = "rc_aff";
/** How long a shared link is remembered: 30 days. */
export const AFFILIATE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * A code as stored and as Stripe shows it: upper case letters and digits, 3 to 20
 * long ("specifix-20 " → "SPECIFIX20"). null when nothing usable is left.
 */
export function normaliseAffiliateCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length >= 3 && code.length <= 20 ? code : null;
}

/** A creator's share of one payment, in the payment's smallest unit, rounded down. */
export function commissionCents(amountPaidCents: number, percent: number = AFFILIATE_COMMISSION_PERCENT): number {
  if (!Number.isFinite(amountPaidCents) || amountPaidCents <= 0) return 0;
  return Math.floor((amountPaidCents * percent) / 100);
}

/** "$2.99" with 20% off → "$2.39": the price a code holder pays, in the same style. */
export function discountedAmount(amount: string, percent: number = AFFILIATE_PERCENT_OFF): string {
  const m = amount.match(/^(\D*)(\d+(?:\.\d+)?)(.*)$/);
  if (!m) return amount;
  const cents = Math.round(Number(m[2]) * 100);
  const off = Math.round((cents * (100 - percent)) / 100);
  return `${m[1]}${(off / 100).toFixed(2)}${m[3]}`;
}

export const AFFILIATE_PLATFORMS = ["YouTube", "TikTok", "Twitch", "Instagram", "X", "Discord", "Other"] as const;

export interface AffiliateApplicationInput {
  name: string;
  email: string;
  platform: string;
  channelUrl: string;
  audience: string | null;
  preferredCode: string | null;
  message: string | null;
}

/** Validate an application from the public form. `spam` = the honeypot was filled. */
export function parseAffiliateApplication(body: unknown): { ok: true; spam: boolean; data: AffiliateApplicationInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Please fill in the form." };
  const b = body as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const name = str(b.name, 80);
  const email = str(b.email, 200).toLowerCase();
  const platform = str(b.platform, 20);
  const channelUrl = str(b.channelUrl, 300);
  if (!name) return { ok: false, error: "Please tell us your name or creator name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Please enter a valid email address." };
  if (!(AFFILIATE_PLATFORMS as readonly string[]).includes(platform)) return { ok: false, error: "Please choose your main platform." };
  if (!/^https?:\/\/\S+\.\S+/i.test(channelUrl)) return { ok: false, error: "Please link your channel (starting with https://)." };
  const preferredRaw = str(b.preferredCode, 40);
  const preferredCode = preferredRaw ? normaliseAffiliateCode(preferredRaw) : null;
  if (preferredRaw && !preferredCode) return { ok: false, error: "A code is 3 to 20 letters or numbers." };
  return {
    ok: true,
    spam: str(b.website, 200).length > 0,
    data: { name, email, platform, channelUrl, audience: str(b.audience, 80) || null, preferredCode, message: str(b.message, 1000) || null },
  };
}
