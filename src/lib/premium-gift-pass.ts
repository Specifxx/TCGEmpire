// THE 3-DAY PREMIUM PASS EMAIL (owner, 2026-11-27: "send like batches separately per website to all of these registered
// users who aren't premium … really clearly outline the features for premium, and then give them like a 3-day pass").
// DECISIONS.md "2026-11-27: A 3-day Premium pass, emailed per site to free accounts".
//
// One email per free account, from the site the account was made on (signupSource "sister:<key>", else RiftCompare),
// in that site's name and colour, listing that site's own Premium features (the same lines as its /premium page). The
// email IS the pass: a successful send grants 3 days of Premium (premiumUntil, extend-only, no card), so every link
// points at the member's own site and nothing has to be claimed on another host.
//
// HARD CONSTANTS, NOT ENV (the lesson in lib/premium-free-week.ts): sends stop by themselves at GIFT_PASS.sendUntil, so
// the last pass ends before the Week Pass test opens on 7 Dec (lib/premium-pass.ts). The free week (2-16 Dec) is for
// accounts made in its window, so the two audiences never meet.
//
// Pure: no database here (lib/premium-gift-pass-server.ts sends and grants), so the tests exercise every rule.
import { escapeHtml } from "./email";
import { MAILING_ADDRESS } from "./mailing-address";
import { COMPANY_NAME, RIFT_BRAND, brandFromSignupSource, type PremiumBrand } from "./premium-brand";

export const GIFT_PASS = {
  key: "gp3",
  campaign: "premium-pass-3day-2026-11",
  days: 3,
  /** No pass is sent after this (1 Dec 2026, 12:00 UTC): the last one ends 4 Dec, before the Week Pass test (7 Dec). */
  sendUntil: Date.UTC(2026, 11, 1, 12),
  /** An account another Premium email reached this recently is left for a later batch (two in two days reads as spam). */
  quietHours: 72,
} as const;

/** One batch: under Brevo's free 300 a day, so a single run can never spend a day's sending on its own. */
export const GIFT_DEFAULT_BATCH = 90;
export const GIFT_MAX_BATCH = 300;

export function giftPassOpen(now: number = Date.now()): boolean {
  return now < GIFT_PASS.sendUntil;
}

/** The Counter row that marks an account as sent (value: the pass's end, epoch seconds). Also how checkout recognises it. */
export function giftPassCounterKey(userId: string): string {
  return `${GIFT_PASS.key}:${userId}`;
}

/** The pass's end: 3 days from `from`, extend-only (an account Premium past that keeps its own date). */
export function giftPassUntil(from: number, currentUntil: number | null): number {
  const end = from + GIFT_PASS.days * 86_400_000;
  return currentUntil !== null && currentUntil > end ? currentUntil : end;
}

// ── Each site's Premium, as its own /premium page lists it ───────────────────────────────────────────────────────

export interface GiftFeature {
  title: string;
  line: string;
  /** A path on the member's own site. */
  path: string;
}

const NO_ADS: GiftFeature = { title: "No banner ads", line: "Every page, on your phone too.", path: "/" };
const ALERTS: GiftFeature = { title: "Up to 200 price alerts", line: "An email the day a product drops to your price (free accounts get 25).", path: "/watches" };
const WATCH: GiftFeature = { title: "Your watch list with today's lowest price", line: "Everything you're tracking, cheapest store first, in one place.", path: "/watches" };
const RESTOCK: GiftFeature = { title: "One-tap back-in-stock alerts", line: "Sold out? Tap once and we email you when a store has it again.", path: "/watches" };
const COLLECTION: GiftFeature = { title: "A year of collection value history", line: "What your collection is worth, day by day, and the whole thing as a spreadsheet.", path: "/collection" };
const ONE_ACCOUNT: GiftFeature = { title: "One account across our sites", line: "The same sign-in and the same Premium on our other price comparison sites.", path: "/account" };

/** Sister keys whose /premium page lists these lines (their PremiumPanel FEATURES). Anything else is not claimed. */
export const GIFT_FEATURES: Record<string, GiftFeature[]> = {
  dex: [NO_ADS, ALERTS, RESTOCK, WATCH, COLLECTION, ONE_ACCOUNT],
  mtg: [NO_ADS, ALERTS, RESTOCK, WATCH, COLLECTION, ONE_ACCOUNT],
  ygo: [NO_ADS, ALERTS, WATCH, COLLECTION, ONE_ACCOUNT],
  tcgprices: [NO_ADS, ALERTS, WATCH, ONE_ACCOUNT],
  gundam: [NO_ADS, ALERTS, WATCH, ONE_ACCOUNT],
  lorcana: [NO_ADS, ALERTS, COLLECTION, WATCH, ONE_ACCOUNT],
  cyberpunk: [NO_ADS, ALERTS, COLLECTION, WATCH, ONE_ACCOUNT],
  wax: [NO_ADS, ALERTS, RESTOCK, WATCH, COLLECTION],
  scent: [NO_ADS, ALERTS, WATCH, { title: "Back-in-stock and price-drop emails", line: "For every bottle on your list.", path: "/watches" }],
  kaeyoung: [NO_ADS, ALERTS, WATCH, { title: "Back-in-stock and price-drop emails", line: "For every product on your list.", path: "/watches" }],
  // RiftCompare's own Premium, as /premium states it (lib/email.ts premiumEmailFeatures).
  rift: [
    { title: "Every deal in Deal Finder", line: "Cards selling below TCGplayer market right now, the whole list.", path: "/tools/deal-finder" },
    { title: "Unlimited price alerts and sealed watches", line: "An email when a card hits your price, or sealed is back in stock or at RRP.", path: "/watching" },
    { title: "Best Basket for your deck", line: "The cheapest store-by-store plan for a whole list, and a deck price watch.", path: "/tools/best-basket" },
    { title: "More card scans a day", line: "Point your phone at a card and see its price in every store.", path: "/scan" },
    { title: "Demand Finder and the full Rising Cards list", line: "The cards players search for and open most, before the price moves.", path: "/rising" },
    { title: "No ads on any page", line: "The whole site, clean.", path: "/" },
  ],
};

/** Where the member signs in to use the pass: a sister's /account (emailed link), RiftCompare's /login. */
export function giftSignInPath(brand: PremiumBrand): string {
  return brand.sister ? "/account" : "/login?next=%2Fpremium";
}

// ── Who gets one ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface GiftUserRow {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  premiumUntil: Date | null;
  premiumTier: string | null;
  premiumTierFloor: string | null;
  emailVerified: Date | null;
  googleId: string | null;
  signupSource: string | null;
  /** The last Premium showcase email (lib/premium-offer.ts), for the quiet-hours rule. */
  priceDropEmailSentAt: Date | null;
}

export interface GiftRecipient {
  id: string;
  email: string;
  displayName: string;
  site: string;
  currentUntil: number | null;
}

export interface GiftAudience {
  bySite: Record<string, { pending: number; sent: number }>;
  excluded: { paying: number; admins: number; seeds: number; unverified: number; optedOut: number; recent: number; otherSite: number };
  pending: GiftRecipient[];
}

/** The site an account belongs to, or null for a sister that has no shared Premium (OP has its own; Bandai is merged). */
export function giftSiteOf(signupSource: string | null): string | null {
  if (typeof signupSource === "string" && signupSource.startsWith("sister:")) {
    const b = brandFromSignupSource(signupSource);
    return b.sister && GIFT_FEATURES[b.key] ? b.key : null;
  }
  return "rift";
}

/**
 * Who a batch may reach, newest accounts first (the rows arrive in that order). Never: a paying or entitled account
 * (any active premiumUntil, comps and the free week included), an admin, a seed persona, an address never verified
 * (no emailed-link or Google sign-in: a bounce costs the sender's reputation), anyone who opted out of announcements,
 * anyone already sent a pass, or anyone another Premium email reached in the last 72 hours (they wait for a later batch).
 */
export function giftAudience(
  rows: GiftUserRow[],
  opts: { optedOut: Set<string>; sent: Set<string>; site?: string | null; now?: number },
): GiftAudience {
  const now = opts.now ?? Date.now();
  const ex = { paying: 0, admins: 0, seeds: 0, unverified: 0, optedOut: 0, recent: 0, otherSite: 0 };
  const bySite: GiftAudience["bySite"] = {};
  const pending: GiftRecipient[] = [];
  const seen = new Set<string>();
  for (const u of rows) {
    const key = u.email.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (key.endsWith("@tcgempire.au") || key === "test@test.com") {
      ex.seeds++;
      continue;
    }
    if (u.isAdmin) {
      ex.admins++;
      continue;
    }
    const site = giftSiteOf(u.signupSource);
    if (!site) {
      ex.otherSite++;
      continue;
    }
    const tally = (bySite[site] ??= { pending: 0, sent: 0 });
    // Sent first: a pass holder is Premium for 3 days and must read as sent, not as paying.
    if (opts.sent.has(u.id)) {
      tally.sent++;
      continue;
    }
    if (u.premiumUntil && u.premiumUntil.getTime() > now) {
      ex.paying++;
      continue;
    }
    if (!u.emailVerified && !u.googleId) {
      ex.unverified++;
      continue;
    }
    if (opts.optedOut.has(key)) {
      ex.optedOut++;
      continue;
    }
    if (u.priceDropEmailSentAt && now - u.priceDropEmailSentAt.getTime() < GIFT_PASS.quietHours * 3_600_000) {
      ex.recent++;
      continue;
    }
    tally.pending++;
    if (opts.site && opts.site !== site) continue;
    pending.push({ id: u.id, email: u.email, displayName: u.displayName, site, currentUntil: u.premiumUntil ? u.premiumUntil.getTime() : null });
  }
  return { bySite, excluded: ex, pending };
}

// ── The email ────────────────────────────────────────────────────────────────────────────────────────────────────

export interface GiftEmailOpts {
  brand: PremiumBrand;
  displayName: string;
  until: number;
  unsubUrl: string;
  oneClickUrl: string;
}

export interface GiftEmail {
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
}

const RIFT_COLOR = "#1ea65c";

function link(brand: PremiumBrand, path: string, content: string): string {
  const u = new URL(path, brand.url);
  u.searchParams.set("utm_source", "email");
  u.searchParams.set("utm_medium", "email");
  u.searchParams.set("utm_campaign", GIFT_PASS.campaign);
  u.searchParams.set("utm_content", content);
  return u.toString();
}

/** "Monday 30 November": the day the pass ends, in words (UTC; the pass runs a full 72 hours, so no hour is promised). */
export function giftEndDay(until: number): string {
  return new Date(until).toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).replace(/^(\w+), (\w+) (\d+)$/, "$1 $3 $2");
}

export function buildGiftPassEmail(o: GiftEmailOpts): GiftEmail {
  const b = o.brand;
  const color = b.color ?? RIFT_COLOR;
  const features = GIFT_FEATURES[b.key] ?? [];
  const first = o.displayName.includes("@") ? "" : (o.displayName.trim().split(/\s+/)[0] ?? "");
  const hi = first ? `Hi ${first},` : "Hi there,";
  const endDay = giftEndDay(o.until);
  const signIn = link(b, giftSignInPath(b), "sign-in");
  const keep = link(b, "/premium", "keep");
  const subject = `Your 3-day ${b.name} Premium pass is on`;
  const preheader = `Free until ${endDay}. No card, nothing to cancel.`;

  const rows = features
    .map(
      (f) => `<tr><td style="padding:10px 0;border-top:1px solid #eef0f3;vertical-align:top" width="26"><div style="width:18px;height:18px;border-radius:9px;background:${color};color:#fff;font-size:12px;line-height:18px;text-align:center;font-weight:700">&#10003;</div></td>
        <td style="padding:10px 0;border-top:1px solid #eef0f3"><a href="${escapeHtml(link(b, f.path, "feature"))}" style="font-size:15px;font-weight:700;color:#111827;text-decoration:none">${escapeHtml(f.title)}</a>
        <div style="font-size:13px;line-height:1.5;color:#4b5563;margin-top:2px">${escapeHtml(f.line)}</div></td></tr>`,
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:28px 8px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:540px;background:#ffffff;border:1px solid #e3e6ea;border-radius:14px">
      <tr><td style="padding:24px 28px 0;font-size:20px;font-weight:800;color:${color}">${escapeHtml(b.name)}</td></tr>
      <tr><td style="padding:18px 28px 0">
        <div style="display:inline-block;background:${color};color:#ffffff;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:4px 10px;border-radius:999px">3-day Premium pass</div>
        <h1 style="margin:12px 0 0;font-size:24px;line-height:1.25;color:#111827">Premium is on, free, until ${escapeHtml(endDay)}</h1>
      </td></tr>
      <tr><td style="padding:12px 28px 0;font-size:15px;line-height:1.6;color:#374151">${escapeHtml(hi)} thanks for being part of ${escapeHtml(b.name)}. We've switched on every Premium feature on your account for the next 3 days, just in time for the Black Friday sales. There's no card to add and nothing to cancel: on ${escapeHtml(endDay)} it simply stops.</td></tr>
      <tr><td style="padding:20px 28px 4px"><a href="${escapeHtml(signIn)}" style="display:inline-block;background:${color};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:9px">Sign in and use your pass</a>
        <div style="margin-top:8px;font-size:12px;color:#6b7280">Sign in with this email address${b.sister ? " (we email you a one-tap link)" : ""} and Premium is already there.</div></td></tr>
      <tr><td style="padding:22px 28px 0"><div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">What your pass unlocks</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">${rows}</table></td></tr>
      <tr><td style="padding:18px 28px 0"><div style="background:#f9fafb;border:1px solid #eef0f3;border-radius:10px;padding:14px 16px;font-size:13px;line-height:1.6;color:#374151"><strong style="color:#111827">Want to keep it?</strong> Premium is US$4.99 a month, or US$39.99 a year (US$3.33 a month). <a href="${escapeHtml(keep)}" style="color:${color};font-weight:700">See the plans</a>. If you'd rather not, do nothing: your free account stays exactly as it was.</div></td></tr>
      <tr><td style="padding:20px 28px 22px;margin-top:18px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.6;color:#6b7280">You're getting this because you have a ${escapeHtml(b.name)} account. It's a one-off: we won't email you about this pass again. <a href="${escapeHtml(o.unsubUrl)}" style="color:#4b5563">Unsubscribe from ${escapeHtml(b.name)} news</a><br/>Sent by ${escapeHtml(COMPANY_NAME)}, the company that runs ${escapeHtml(b.name)} · ${escapeHtml(MAILING_ADDRESS)}</td></tr>
    </table></td></tr></table></body></html>`;

  const text = [
    `${b.name}: your 3-day Premium pass is on`,
    "",
    hi,
    `Thanks for being part of ${b.name}. Every Premium feature is on for your account, free, until ${endDay}. No card to add and nothing to cancel: on ${endDay} it simply stops.`,
    "",
    `Sign in with this email address and use it: ${signIn}`,
    "",
    "What your pass unlocks:",
    ...features.map((f) => `- ${f.title}: ${f.line}`),
    "",
    `Want to keep it? Premium is US$4.99 a month, or US$39.99 a year (US$3.33 a month): ${keep}`,
    "If you'd rather not, do nothing: your free account stays exactly as it was.",
    "",
    `You're getting this because you have a ${b.name} account. Unsubscribe from ${b.name} news: ${o.unsubUrl}`,
    `Sent by ${COMPANY_NAME}, the company that runs ${b.name}. ${MAILING_ADDRESS}`,
  ].join("\n");

  return {
    subject,
    html,
    text,
    headers: { "List-Unsubscribe": `<${o.oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

export { RIFT_BRAND };
