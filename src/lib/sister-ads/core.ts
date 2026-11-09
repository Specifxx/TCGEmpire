// PAID FEATURED LISTINGS, the pure half (owner, 2026-11-09: "people pay for a
// direct spot on the website via Stripe. It will cost $100 per featured listing
// per week", the link "can be any website or eBay or etc."). DECISIONS.md,
// "Paid featured listings on the sister sites".
//
// A seller's words and links are screened by the owner before anything shows
// (/admin/sister-ads), so a link may point anywhere; everything here only keeps
// what is typed well-formed and safe to draw: https only, no credentials, no
// private addresses, short text. The text is drawn as plain text, never HTML.

export const WEEK_PRICE_CENTS = 10_000; // US$100 a week
export const MIN_WEEKS = 1;
export const MAX_WEEKS = 4;
/** How many approved ads one site shows at once; later ones start when a slot frees. */
export const MAX_LIVE_PER_SITE = 3;
export const AD_REGIONS = ["ALL", "US", "UK", "CA", "AU", "NZ", "EU", "SG"] as const;
export type AdRegion = (typeof AD_REGIONS)[number];
export type AdStatus = "awaiting_payment" | "pending" | "approved" | "rejected" | "cancelled";
export const WEEK_MS = 7 * 86_400_000;

export function amountFor(weeks: number): number {
  return WEEK_PRICE_CENTS * weeks;
}

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i;

/** True for IPv4 / IPv6 literals and single-label hosts: nobody's shop. */
function badHost(host: string): boolean {
  if (PRIVATE_HOST.test(host)) return true;
  if (host.includes(":") || /^\d+(\.\d+){0,3}$/.test(host) || /^0x/i.test(host)) return true;
  return !host.includes(".");
}

/** A public https URL, normalised, or null. */
export function cleanUrl(input: unknown, max = 800): string | null {
  const raw = String(input ?? "").trim();
  if (!raw || raw.length > max) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port || badHost(u.hostname)) return null;
  return u.toString();
}

/** Strip control characters and collapse whitespace; plain text only. */
export function cleanText(input: unknown, max: number): string {
  return String(input ?? "")
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export interface AdInput {
  weeks: number;
  title: string;
  blurb: string | null;
  destUrl: string;
  imageUrl: string;
  priceText: string | null;
  region: AdRegion;
  email: string;
}

/** The submitted form → a clean order, or the message to show the seller. */
export function validateAd(body: any): { ok: true; ad: AdInput } | { ok: false; error: string } {
  const weeks = Number(body?.weeks);
  if (!Number.isInteger(weeks) || weeks < MIN_WEEKS || weeks > MAX_WEEKS) return { ok: false, error: `Choose ${MIN_WEEKS} to ${MAX_WEEKS} weeks.` };
  const title = cleanText(body?.title, 80);
  if (title.length < 6) return { ok: false, error: "Give your listing a title of at least a few words." };
  const destUrl = cleanUrl(body?.destUrl);
  if (!destUrl) return { ok: false, error: "The listing link must be a full https:// address, like https://www.ebay.com/itm/123." };
  const imageUrl = cleanUrl(body?.imageUrl);
  if (!imageUrl) return { ok: false, error: "The photo link must be a full https:// address to an image." };
  const region = String(body?.region ?? "");
  if (!(AD_REGIONS as readonly string[]).includes(region)) return { ok: false, error: "Choose where it should show." };
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) return { ok: false, error: "Enter an email address we can reach you on." };
  const blurb = cleanText(body?.blurb, 140) || null;
  const priceText = cleanText(body?.priceText, 30) || null;
  return { ok: true, ad: { weeks, title, blurb, destUrl, imageUrl, priceText, region: region as AdRegion, email } };
}

/** What a site's feed publishes for one approved ad (no email, no ids that matter). */
export interface PublicAd {
  id: string;
  title: string;
  blurb: string | null;
  url: string;
  image: string;
  price: string | null;
  region: AdRegion;
  startsAt: string;
  endsAt: string;
}

/**
 * When an ad approved at `now` starts: at once while the site has a free slot,
 * otherwise when the earliest live or queued ad ends. `ends` are the endsAt of
 * the site's approved ads that have not ended yet.
 */
export function startFor(now: number, ends: number[]): number {
  const open = ends.filter((e) => e > now).sort((a, b) => a - b);
  if (open.length < MAX_LIVE_PER_SITE) return now;
  return open[open.length - MAX_LIVE_PER_SITE];
}
