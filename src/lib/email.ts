import { SITE_NAME, SITE_URL, TIER_NAMES, premiumFromLine, type PremiumTierKey } from "./site";
import { formatMoney } from "./format";
import { currencyOf, type Country } from "./country";
import { issueNoun } from "./price-report";
import { RADIANCE_RELEASE_DATE } from "./sets/radiance";

export function isEmailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY;
}

// The most recent reason a send failed (provider + HTTP status + response
// body, or the thrown error), for batch callers that count failures and want
// to say WHY in their summary. Every failure path below writes it; a
// successful send clears it. Deliberately a plain module variable, not part of
// sendEmail's return type, so the dozens of existing boolean callers are
// untouched.
let lastEmailError: string | null = null;
export function getLastEmailError(): string | null {
  return lastEmailError;
}
async function noteProviderFailure(provider: string, res: Response): Promise<void> {
  const body = await res.text().catch(() => "");
  // Brevo's "Authorised IPs" account setting rejects every request from a
  // platform with rotating outbound IPs (every Vercel serverless invocation)
  // with this exact message — first diagnosed 2026-09-14 after a live
  // premium-offer batch came back sent 0/90 with no other symptom (see
  // DECISIONS.md, "why Brevo failed"). It is an account setting, not
  // anything this code can retry or route around, so callers batching
  // hundreds of sends deserve the real cause on the first failure rather
  // than 90 identical opaque "401" lines before anyone reads one closely.
  const ipBlocked = provider === "Brevo" && res.status === 401 && /unrecognised ip address/i.test(body);
  lastEmailError = ipBlocked
    ? `Brevo: rejecting Vercel's IP (account "Authorised IPs" restriction is on — Brevo dashboard → Security → Authorised IPs → turn it off; Vercel's outbound IP is not static, so allow-listing one address will not hold)`
    : `${provider} ${res.status}: ${body.slice(0, 300)}`;
}

// Send a transactional email via Resend's REST API. Requires RESEND_API_KEY (and
// ideally a verified sender in EMAIL_FROM) to actually deliver; otherwise it
// no-ops and logs, so the rest of the app keeps working without email configured.
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`[email] RESEND_API_KEY not set — "${subject}" to ${to} was NOT sent.`);
    lastEmailError = "Resend: RESEND_API_KEY not set";
    return false;
  }
  // Send from the verified riftcompare.com domain by default so Resend allows
  // delivery to ANY recipient (the old onboarding@resend.dev fallback is Resend's
  // shared test sender and can only email the Resend account owner). Override with
  // EMAIL_FROM if you want a different address on the verified domain.
  const from = process.env.EMAIL_FROM ?? `${SITE_NAME} <noreply@riftcompare.com>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      console.warn(`[email] Resend returned ${res.status} for "${subject}".`);
      await noteProviderFailure("Resend", res);
    } else lastEmailError = null;
    return res.ok;
  } catch (e) {
    console.warn("[email] send failed:", e);
    lastEmailError = `Resend: ${e instanceof Error ? e.message : String(e)}`;
    return false;
  }
}

export function isBrevoEnabled(): boolean {
  return !!process.env.BREVO_API_KEY;
}

// Splits the same "Name <email@x.com>" string EMAIL_FROM already uses for
// Resend into Brevo's separate sender.name/sender.email fields.
function parseFrom(raw: string): { name: string; email: string } {
  const m = raw.match(/^(.*)<(.+)>$/);
  if (m) return { name: m[1]!.trim().replace(/^"|"$/g, ""), email: m[2]!.trim() };
  return { name: SITE_NAME, email: raw.trim() };
}

// Sends via Brevo (app.brevo.com) instead of Resend. Used ONLY for the weekly
// digest to registered accounts (see lib/user-digest.ts) so that larger,
// recurring audience never eats into the Resend quota the rest of the app's
// transactional email (verification, password reset, price alerts, the
// opt-in newsletter) depends on. Free tier: 300 emails/day, no card required
// — app.brevo.com → SMTP & API → API Keys. The sender address must be
// verified inside Brevo separately from Resend's domain verification.
export async function sendEmailBrevo(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.BREVO_API_KEY;
  if (!key) {
    console.warn(`[email] BREVO_API_KEY not set — "${subject}" to ${to} was NOT sent.`);
    lastEmailError = "Brevo: BREVO_API_KEY not set";
    return false;
  }
  const sender = parseFrom(process.env.EMAIL_FROM ?? `${SITE_NAME} <noreply@riftcompare.com>`);
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html }),
    });
    if (!res.ok) {
      console.warn(`[email] Brevo returned ${res.status} for "${subject}".`);
      await noteProviderFailure("Brevo", res);
    } else lastEmailError = null;
    return res.ok;
  } catch (e) {
    console.warn("[email] Brevo send failed:", e);
    lastEmailError = `Brevo: ${e instanceof Error ? e.message : String(e)}`;
    return false;
  }
}

// On-brand HTML wrapper for transactional emails.
function layout(heading: string, body: string, cta: { label: string; url: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#0b0e14;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0e14;padding:32px 0"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#131a26;border:1px solid #233047;border-radius:16px">
      <tr><td style="padding:28px 32px 6px"><div style="font-size:22px;font-weight:800;color:#fff">Rift<span style="color:#34d17e">Compare</span></div></td></tr>
      <tr><td style="padding:6px 32px 4px"><h1 style="margin:0;font-size:20px;color:#fff">${heading}</h1></td></tr>
      <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">${body}</td></tr>
      <tr><td style="padding:4px 32px 26px"><a href="${cta.url}" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">${cta.label}</a></td></tr>
      <tr><td style="padding:16px 32px 26px;border-top:1px solid #233047;font-size:12px;color:#6b7585">RiftCompare · Riftbound card price comparison.<br/>If you didn't request this, you can safely ignore this email.</td></tr>
    </table></td></tr></table></body></html>`;
}

export async function sendVerificationEmail(to: string, token: string): Promise<boolean> {
  return sendEmail(
    to,
    "Confirm your RiftCompare email",
    layout("Confirm your email", "Thanks for signing up — confirm your email address to finish setting up your RiftCompare account.", {
      label: "Confirm email",
      url: `${SITE_URL}/verify?token=${encodeURIComponent(token)}`,
    })
  );
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<boolean> {
  return sendEmail(
    to,
    "Reset your RiftCompare password",
    layout("Reset your password", "We received a request to reset your RiftCompare password. This link expires in 1 hour.", {
      label: "Reset password",
      url: `${SITE_URL}/reset?token=${encodeURIComponent(token)}`,
    })
  );
}

// ─── Wishlist price-drop alerts ──────────────────────────────────────────────

export interface AlertCard {
  name: string;
  setCode: string;
  collectorNumber: string;
  url: string; // absolute card-page link
}

// The listing behind an alert's price (lib/price-alerts.ts cheapestStores):
// the store that set it, that row's own price and an affiliate-wrapped link to
// the exact listing. shippingCents is null unless the store states postage —
// and the copy then says "postage extra", never "delivered".
export interface AlertStore {
  name: string;
  url: string;
  priceCents: number;
  shippingCents: number | null;
  condition: string | null;
}

export interface PriceDropItem extends AlertCard {
  // "listed" = the card's FIRST price in this market (lib/price-alerts.ts
  // isFirstPrice): there is no old price to strike through, so oldCents is null.
  // "target" = a Plus/Premium watch at or below its own target price, and
  // "under-market" = a Plus/Premium watch that entered Deal Finder's
  // cheaper-than-TCGplayer-market ranking at a new low (2026-09-25 lineup).
  kind?: "drop" | "listed" | "target" | "under-market";
  cardId?: string;
  oldCents: number | null;
  newCents: number;
  market: Country;
  // The member's target, on a "target" item.
  targetCents?: number | null;
  // The cheapest in-stock listing at this price, when the lookup found one.
  store?: AlertStore | null;
}

// Footer with an unsubscribe link, appended to every alert email so recipients
// always have a one-click way out (and so we stay CAN-SPAM/GDPR-friendly).
function alertFooter(unsubUrl: string): string {
  return `<tr><td style="padding:16px 32px 26px;border-top:1px solid #233047;font-size:12px;color:#6b7585">
    You're getting this because you asked RiftCompare to watch your wishlist for price drops.<br/>
    <a href="${unsubUrl}" style="color:#9aa4b2;text-decoration:underline">Unsubscribe from price-drop emails</a> · RiftCompare · Riftbound card price comparison.
  </td></tr>`;
}

// One-row "create a free account" block for MARKETING-ADJACENT emails going to
// people we know DON'T have an account (anonymous price-alert watchers, the
// newsletter list). These lists get value from us indefinitely and, until this
// existed, were never once asked to register — the softest possible audience,
// asked nowhere. Deliberately NOT added to user-digest or transactional sends:
// those recipients are registered already, and an account CTA there is noise.
//
// The link lands on /login?src=email…, which AuthForm converts into
// markSignupSource("email") — so email-attributed signups show up in
// User.signupSource and the admin breakdown, closing the loop.
export function accountCtaBlock(campaign: string, line?: string): string {
  const copy =
    line ??
    "Price alerts, a live portfolio and a watchlist you can manage in one place — free.";
  const url = `${SITE_URL}/login?src=email&utm_source=email&utm_medium=email&utm_campaign=${encodeURIComponent(campaign)}`;
  return `<tr><td style="padding:4px 32px 20px">
    <div style="border:1px solid #233047;border-radius:12px;padding:14px 16px">
      <div style="font-size:13px;line-height:1.5;color:#b8c0cc">${copy}</div>
      <a href="${url}" style="display:inline-block;margin-top:10px;border:1px solid #34d17e;color:#34d17e;font-size:13px;font-weight:700;text-decoration:none;padding:8px 16px;border-radius:8px">Create your free account</a>
    </div>
  </td></tr>`;
}

export function emailShell(heading: string, inner: string, footer: string): string {
  return `<!doctype html><html><body style="margin:0;background:#0b0e14;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0e14;padding:32px 0"><tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#131a26;border:1px solid #233047;border-radius:16px">
      <tr><td style="padding:28px 32px 6px"><div style="font-size:22px;font-weight:800;color:#fff">Rift<span style="color:#34d17e">Compare</span></div></td></tr>
      <tr><td style="padding:6px 32px 4px"><h1 style="margin:0;font-size:20px;color:#fff">${heading}</h1></td></tr>
      ${inner}
      ${footer}
    </table></td></tr></table></body></html>`;
}

// What the store line says about postage. The alert price is an ITEM price
// (Card.lowestPriceCents* has no shipping in it), so unless the store states
// postage for that listing the copy says so plainly — never "delivered".
export function postageNote(store: Pick<AlertStore, "shippingCents">, currency: string): string {
  if (store.shippingCents == null) return "item price, postage extra";
  if (store.shippingCents === 0) return "free postage";
  return `+ ${formatMoney(store.shippingCents, currency)} postage`;
}

// The line under an alert naming the store behind the price and linking the
// exact listing, so the reader can check it before paying. Shows that listing's
// own price. Empty when the lookup found no row (the card link still works).
export function storeLine(item: PriceDropItem): string {
  const store = item.store;
  if (!store) return "";
  const cur = currencyOf(item.market);
  // Scraped strings, so escaped (escapeHtml is hoisted from further down).
  const condition = store.condition ? ` (${escapeHtml(store.condition)})` : "";
  return `
    <div style="margin-top:6px;font-size:13px;color:#b8c0cc">
      Cheapest at <strong style="color:#fff">${escapeHtml(store.name)}</strong>: ${formatMoney(store.priceCents, cur)}${condition} · ${postageNote(store, cur)}
      &nbsp;<a href="${escapeHtml(store.url)}" style="color:#34d17e;font-weight:700;text-decoration:none">View listing →</a>
    </div>`;
}

// One row in the price-drop table. A first listing ("listed") has no old price,
// so it reads "Now in stock · from X" — no strikethrough, no percentage.
export function dropRow(item: PriceDropItem): string {
  const cur = currencyOf(item.market);
  const head = `<tr><td style="padding:12px 0;border-bottom:1px solid #233047">
    <a href="${item.url}" style="color:#fff;font-weight:700;text-decoration:none;font-size:15px">${item.name}</a>
    <div style="font-size:12px;color:#6b7585;margin-top:2px">${item.setCode} · ${item.collectorNumber}</div>`;
  const tail = `${storeLine(item)}
  </td></tr>`;
  const now = `<span style="color:#34d17e;font-weight:700">${formatMoney(item.newCents, cur)}</span>`;
  if (item.kind === "target") {
    const target = item.targetCents != null ? ` of ${formatMoney(item.targetCents, cur)}` : "";
    return `${head}
    <div style="margin-top:6px;font-size:14px;color:#b8c0cc">
      Hit your target${target} · now ${now}
    </div>${tail}`;
  }
  if (item.kind === "under-market") {
    return `${head}
    <div style="margin-top:6px;font-size:14px;color:#b8c0cc">
      Cheaper than TCGplayer market · now ${now}
    </div>${tail}`;
  }
  if (item.kind === "listed" || item.oldCents == null) {
    return `${head}
    <div style="margin-top:6px;font-size:14px;color:#b8c0cc">
      Now in stock · from ${now}
    </div>${tail}`;
  }
  const pct = item.oldCents > 0 ? Math.round(((item.oldCents - item.newCents) / item.oldCents) * 100) : 0;
  return `${head}
    <div style="margin-top:6px;font-size:14px;color:#b8c0cc">
      <span style="color:#6b7585;text-decoration:line-through">${formatMoney(item.oldCents, cur)}</span>
      &nbsp;→&nbsp;${now}
      ${pct > 0 ? `&nbsp;<span style="background:#13351f;color:#34d17e;font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px">-${pct}%</span>` : ""}
    </div>${tail}`;
}

// The price an alert quotes: the named listing's own price when the store
// lookup found one, else the card's lowest price in that market.
function alertPrice(item: PriceDropItem): string {
  return formatMoney(item.store?.priceCents ?? item.newCents, currencyOf(item.market));
}

// Heading, intro and subject for a price-alert digest. Three shapes: every item
// a drop (the original copy, unchanged), every item a first listing ("now in
// stock"), or a mix of both. Pure and exported so the copy is unit-tested.
export function priceDropCopy(items: PriceDropItem[]): { heading: string; intro: string; subject: string } {
  const count = items.length;
  // A paid trigger leads the subject, because it is what the member asked for:
  // "{Card} hit your target: {price} at {store}". The price is the named
  // listing's own price when the store lookup found it.
  const more = count > 1 ? ` (+${count - 1} more)` : "";
  const target = items.find((i) => i.kind === "target");
  if (target) {
    return {
      heading: count === 1 ? "A card you're watching hit your target" : `Price news on ${count} cards you're watching`,
      intro:
        count === 1
          ? "A card you're watching is at or below the price you set:"
          : "A card you're watching is at or below the price you set, and there's news on others:",
      subject: `${target.name} hit your target: ${alertPrice(target)}${target.store ? ` at ${target.store.name}` : ""}${more}`,
    };
  }
  const under = items.find((i) => i.kind === "under-market");
  if (under) {
    return {
      heading: count === 1 ? "A card you're watching is below TCGplayer market" : `Price news on ${count} cards you're watching`,
      intro:
        count === 1
          ? "A card you're watching is selling below TCGplayer's market price, at a new low:"
          : "A card you're watching is selling below TCGplayer's market price, and there's news on others:",
      subject: `${under.name} is below TCGplayer market: ${alertPrice(under)}${under.store ? ` at ${under.store.name}` : ""}${more}`,
    };
  }
  const listed = items.filter((i) => i.kind === "listed" || i.oldCents == null).length;
  const first = items[0]!;
  const firstPrice = formatMoney(first.newCents, currencyOf(first.market));
  if (listed === 0) {
    return {
      heading: count === 1 ? "A wishlist card just got cheaper" : `${count} wishlist cards just got cheaper`,
      intro: `Good news — ${count === 1 ? "a card you're watching" : "some cards you're watching"} dropped in price:`,
      subject: count === 1 ? `Price drop: ${first.name} is now ${firstPrice}` : `Price drops on ${count} of your wishlist cards`,
    };
  }
  if (listed === count) {
    return {
      heading: count === 1 ? "A card you're watching is now in stock" : `${count} cards you're watching are now in stock`,
      intro: `${count === 1 ? "A card you're watching is" : "Cards you're watching are"} now in stock:`,
      subject: count === 1 ? `${first.name} is now in stock from ${firstPrice}` : `${count} of your wishlist cards are now in stock`,
    };
  }
  return {
    heading: `Price news on ${count} wishlist cards`,
    intro: "Some cards you're watching got cheaper, and some are now in stock:",
    subject: `Price drops and new listings on ${count} of your wishlist cards`,
  };
}

// The daily "a card on your wishlist got cheaper" email. Lists every card that
// dropped (or first listed — see priceDropCopy) since the last check in one message.
// `anonymous` = this address has no linked account (PriceAlert.userId is null).
// Only THOSE recipients get the account CTA — its "your existing alerts come
// with you" promise is claimAlertsForUser's adopt-by-email behavior, which is
// meaningless (and the CTA is pure noise) for someone already signed up.
export async function sendPriceDropEmail(to: string, items: PriceDropItem[], unsubUrl: string, anonymous = false): Promise<boolean> {
  const { heading, intro, subject } = priceDropCopy(items);
  // A paid alert (target / below-market) links to Deal Finder filtered to the
  // member's own watchlist; everyone else keeps the card database button.
  const paid = items.some((i) => i.kind === "target" || i.kind === "under-market");
  const button = paid
    ? { href: `${SITE_URL}/tools/deal-finder?mine=watch`, label: "Your watched cards in Deal Finder" }
    : { href: `${SITE_URL}/browse`, label: "Card database" };
  const inner = `
    <tr><td style="padding:8px 32px 4px;font-size:14px;line-height:1.6;color:#b8c0cc">${intro}</td></tr>
    <tr><td style="padding:4px 32px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items.map(dropRow).join("")}</table></td></tr>
    <tr><td style="padding:4px 32px 24px"><a href="${button.href}" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">${button.label}</a></td></tr>
    ${anonymous ? accountCtaBlock("price-drop", "Manage your price watches with a free account — your existing alerts come with you automatically.") : ""}`;
  return sendEmail(to, subject, emailShell(heading, inner, alertFooter(unsubUrl)));
}

// Sent once when someone subscribes via the wishlist pop-up, confirming the watch
// and surfacing the unsubscribe link up front.
export async function sendAlertConfirmationEmail(to: string, cardCount: number, unsubUrl: string, anonymous = false): Promise<boolean> {
  const inner = `
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">
      You're all set — we'll email you when ${cardCount === 1 ? "the card" : `any of the ${cardCount} cards`} on
      your wishlist hits a new low, naming the cheapest store and linking the listing. At most one email a week.
    </td></tr>
    <tr><td style="padding:4px 32px 24px"><a href="${SITE_URL}/browse" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">Card database</a></td></tr>
    ${anonymous ? accountCtaBlock("alert-confirm", "Manage your price watches with a free account — your existing alerts come with you automatically.") : ""}`;
  return sendEmail(to, "You're watching your RiftCompare wishlist for price drops", emailShell("Price-drop alerts are on", inner, alertFooter(unsubUrl)));
}

// ─── Weekly newsletter digest ────────────────────────────────────────────────

// Newsletter footer: the audience opted in via the footer signup, so the copy
// reflects that consent (distinct from the wishlist-alert footer above).
function newsletterFooter(unsubUrl: string): string {
  return `<tr><td style="padding:16px 32px 26px;border-top:1px solid #233047;font-size:12px;color:#6b7585">
    You're getting this because you signed up for the weekly ${SITE_NAME} Index summary.<br/>
    <a href="${unsubUrl}" style="color:#9aa4b2;text-decoration:underline">Unsubscribe</a> · RiftCompare · Riftbound card price comparison.
  </td></tr>`;
}

// Footer for PRODUCT ANNOUNCEMENTS sent to registered accounts. A separate footer
// from newsletterFooter because that one states "you signed up for the weekly Index
// summary" — which is simply untrue for someone who made an account and never
// subscribed to anything. Saying so on a commercial email is both inaccurate and
// the fastest way to get marked as spam, so this one states the real reason and
// points at the announcement-specific opt-out (which does NOT touch their account
// emails, price alerts or the weekly digest — see app/announcements/unsubscribe).
function announcementFooter(unsubUrl: string): string {
  return `<tr><td style="padding:16px 32px 26px;border-top:1px solid #233047;font-size:12px;color:#6b7585">
    You're getting this because you have a ${SITE_NAME} account. This is a one-off product announcement, not a subscription.<br/>
    <a href="${unsubUrl}" style="color:#9aa4b2;text-decoration:underline">Don't email me announcements</a> · RiftCompare · Riftbound card price comparison.
  </td></tr>`;
}

// The weekly digest itself; `inner` is built by lib/newsletter.ts so the content
// (movers tables, Index summary) lives next to the data that produces it.
export async function sendNewsletterDigestEmail(to: string, subject: string, heading: string, inner: string, unsubUrl: string): Promise<boolean> {
  // The newsletter list (NewsletterSubscriber) is captured without an account,
  // so the weekly digest carries the generic account CTA. Some subscribers may
  // also hold accounts — acceptable noise for one soft block, unlike the alert
  // emails where the caller knows userId and gates it precisely.
  return sendEmail(to, subject, emailShell(heading, inner + accountCtaBlock("newsletter"), newsletterFooter(unsubUrl)));
}

// One-off release-day blast for a new set (e.g. Vendetta, 31 Jul 2026). Sent to the
// countdown/newsletter list from scripts/send-release-day.ts on release day — the
// moment of peak buy-intent the countdown page promises. `setName`/`setSlug` keep it
// reusable for future sets.
//
// EVERY NUMBER IS PASSED IN, NOT HARDCODED. The previous version of this template
// asserted "60+ stores in AU, US and the UK" in static copy. That silently went
// stale: the comparison now covers FIVE markets (Singapore and Canada were added
// after it was written) and well over a hundred stores, so the email was
// understating coverage and omitting markets entirely to real subscribers.
// Counts now come from live queries at send time (see the script), and any stat the
// caller can't resolve is simply omitted rather than guessed — same rule the site
// itself follows for prices.
export interface ReleaseDayStats {
  cardCount: number | null; // cards tracked for this set
  pricedCount: number | null; // how many of those have a live price
  storeCount: number | null; // retailers in the comparison
  marketCount: number | null; // markets covered
  sealedAvailable: boolean; // whether sealed products for this set are live
}

export async function sendReleaseDayEmail(
  to: string,
  setName: string,
  setSlug: string,
  unsubUrl: string,
  stats: ReleaseDayStats,
  // Which footer to use. "subscriber" = they opted into the newsletter, so the
  // newsletter footer/unsub is correct. "account" = a registered user receiving a
  // one-off announcement; claiming they subscribed would be false.
  recipient: "subscriber" | "account" = "subscriber"
): Promise<boolean> {
  const utmq = "utm_source=newsletter&utm_medium=email&utm_campaign=release-day";
  const setUrl = `${SITE_URL}/sets/${setSlug}?${utmq}`;
  const sealedUrl = `${SITE_URL}/sealed?q=${encodeURIComponent(setName.toLowerCase())}&${utmq}`;
  const browseUrl = `${SITE_URL}/browse?${utmq}`;
  const deckUrl = `${SITE_URL}/deck?${utmq}`;

  // Stat tiles. Table-based (not flex/grid) because Outlook ignores modern CSS —
  // this is the one layout that renders identically in Gmail, Apple Mail and
  // Outlook. Only tiles with a REAL number are emitted, so a failed stat query
  // shrinks the row rather than printing "—" or a guess.
  const tiles: { value: string; label: string }[] = [];
  if (stats.cardCount != null && stats.cardCount > 0)
    // "printings", not "cards": the live count includes alt-arts, Signatures,
    // Overnumbers and promos, so it is legitimately HIGHER than the set's headline
    // card count (e.g. Vendetta: 235 printings vs a 166-card set). Labelling it "cards"
    // would misstate the set's size to anyone who knows the number.
    tiles.push({ value: stats.cardCount.toLocaleString(), label: "printings live" });
  if (stats.storeCount != null && stats.storeCount > 0)
    tiles.push({ value: String(stats.storeCount), label: "stores compared" });
  if (stats.marketCount != null && stats.marketCount > 0)
    tiles.push({ value: String(stats.marketCount), label: "markets" });

  const tileRow = tiles.length
    ? `<tr><td style="padding:4px 32px 20px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        ${tiles
          .map(
            (t, i) => `<td width="${Math.floor(100 / tiles.length)}%" align="center" style="background:#0f1622;border:1px solid #233047;border-radius:12px;padding:14px 6px;${i < tiles.length - 1 ? "border-right-width:1px" : ""}">
              <div style="font-size:24px;font-weight:800;color:#34d17e;line-height:1.1">${t.value}</div>
              <div style="font-size:11px;color:#8b95a5;text-transform:uppercase;letter-spacing:.5px;margin-top:4px">${t.label}</div>
            </td>${i < tiles.length - 1 ? '<td width="8"></td>' : ""}`
          )
          .join("")}
        </tr></table></td></tr>`
    : "";

  const pricedLine =
    stats.pricedCount != null && stats.pricedCount > 0
      ? ` <strong style="color:#e6ebf2">${stats.pricedCount.toLocaleString()}</strong> already have a live price.`
      : "";

  // One reusable "feature card" block — a bordered panel with an accent bar, so the
  // three value props read as distinct sections instead of a wall of paragraphs.
  const card = (accent: string, title: string, body: string, link: { href: string; label: string } | null) => `
    <tr><td style="padding:0 32px 12px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f1622;border:1px solid #233047;border-radius:12px">
        <tr>
          <td width="4" style="background:${accent};border-radius:12px 0 0 12px"></td>
          <td style="padding:14px 16px">
            <div style="font-size:15px;font-weight:700;color:#fff;margin-bottom:4px">${title}</div>
            <div style="font-size:13px;line-height:1.6;color:#b8c0cc">${body}</div>
            ${link ? `<div style="margin-top:8px"><a href="${link.href}" style="color:${accent};font-weight:700;font-size:13px;text-decoration:none">${link.label} →</a></div>` : ""}
          </td>
        </tr>
      </table>
    </td></tr>`;

  const sealedCard = stats.sealedAvailable
    ? card(
        "#f2c94c",
        "Sealed is priced too",
        // Deliberately names no SKU. This read "Booster boxes, packs and Proving
        // Grounds kits", which was true of the set it was written for and is not
        // true of the next one — Radiance leads with a Vault and Showdown Decks,
        // and Proving Grounds is a 2025 product. Nothing else in this template
        // hardcodes a fact about a specific set; this was the exception.
        `Every sealed product we can find for the set — ranked by total delivered cost, with an at-RRP flag so you can see instantly whether a box is a fair price or a scalp.`,
        { href: sealedUrl, label: `Compare ${setName} sealed` }
      )
    : "";

  const inner = `
    <!-- Hero band -->
    <tr><td style="padding:0 32px 4px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#132a1e;border:1px solid #2f6b4a;border-radius:12px">
        <tr><td style="padding:16px 18px">
          <div style="display:inline-block;background:#34d17e;color:#06210f;font-size:11px;font-weight:800;letter-spacing:.6px;padding:3px 8px;border-radius:5px">OUT NOW</div>
          <div style="font-size:17px;font-weight:700;color:#fff;margin-top:10px;line-height:1.4">
            ${setName} has landed — and every card is already priced.
          </div>
          <div style="font-size:13px;line-height:1.6;color:#a9d9c0;margin-top:6px">
            You asked us to tell you the moment prices went live. They're live now.
          </div>
        </td></tr>
      </table>
    </td></tr>

    <tr><td style="height:18px"></td></tr>
    ${tileRow}

    ${card(
      "#34d17e",
      "The full card database, ready",
      `Every ${setName} card has its own page with the complete store-by-store comparison, price history and printing variants — alt-arts, Signatures, Overnumbers and promos all tracked separately.${pricedLine}`,
      { href: setUrl, label: `Browse ${setName}` }
    )}
    ${card(
      "#4a9eff",
      "Cheapest delivered, not cheapest listed",
      `We rank by what you actually pay — item price plus postage, with each store's free-shipping threshold factored in. Launch-week prices move fast, so it's worth checking before you commit.`,
      null
    )}
    ${sealedCard}
    ${card(
      "#a855f7",
      "Building a deck?",
      `Paste a decklist into the deck pricer and it works out the cheapest way to buy the whole thing — consolidating stores so you don't pay postage five times over.`,
      { href: deckUrl, label: "Price a deck" }
    )}

    <!-- Primary CTA -->
    <tr><td align="center" style="padding:14px 32px 6px">
      <a href="${setUrl}" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:800;font-size:15px;text-decoration:none;padding:14px 30px;border-radius:10px">See every ${setName} price →</a>
    </td></tr>
    <tr><td align="center" style="padding:0 32px 24px;font-size:12px;color:#6b7585">
      or <a href="${browseUrl}" style="color:#9aa4b2;text-decoration:underline">browse the whole database</a>
    </td></tr>`;

  const subject =
    stats.storeCount != null
      ? `${setName} is out — every card priced across ${stats.storeCount} stores`
      : `${setName} is out — see every card's cheapest price`;

  const footer = recipient === "account" ? announcementFooter(unsubUrl) : newsletterFooter(unsubUrl);
  return sendEmail(to, subject, emailShell(`${setName} is here`, inner, footer));
}

// ─── Weekly digest to registered accounts (not opt-in subscribers) ──────────

// A separate footer from newsletterFooter above: this audience never opted
// into anything, so the copy says so — and it points at the digest-specific
// opt-out (UserDigestOptOut), which is deliberately its own suppression list,
// not AnnouncementOptOut (see the long comment on that model in schema.prisma
// for why sharing it with the one-off release-day blast would be a bug).
function accountDigestFooter(unsubUrl: string): string {
  return `<tr><td style="padding:16px 32px 26px;border-top:1px solid #233047;font-size:12px;color:#6b7585">
    You're getting this because you have a ${SITE_NAME} account. It's our weekly market digest, sent to every member.<br/>
    <a href="${unsubUrl}" style="color:#9aa4b2;text-decoration:underline">Unsubscribe from this digest</a> · RiftCompare · Riftbound card price comparison.
  </td></tr>`;
}

// Same content shape as sendNewsletterDigestEmail (built by lib/user-digest.ts
// reusing lib/newsletter.ts's buildDigest). BREVO BY DEFAULT (this audience is
// too large for Resend's 100/day quota, which transactional email depends on)
// — but `via: "resend"` exists as an escape hatch, same pattern as
// sendPremiumOfferEmail. THIS IS NOT HYPOTHETICAL: Brevo's "Authorised IPs"
// account setting silently refused every send from this route for an unknown
// stretch (see DECISIONS.md, 2026-09-10 — "the daily registered-account digest
// has been failing silently ... its summary counts `failed` but nothing
// alerts on it"), and the fix was a Brevo dashboard setting, not code. `via`
// lets a run continue reaching accounts through Resend while that setting (or
// any future Brevo outage) is unresolved.
export async function sendUserDigestEmail(
  to: string,
  subject: string,
  heading: string,
  inner: string,
  unsubUrl: string,
  via: "brevo" | "resend" = "brevo"
): Promise<boolean> {
  const html = emailShell(heading, inner, accountDigestFooter(unsubUrl));
  return via === "resend" ? sendEmail(to, subject, html) : sendEmailBrevo(to, subject, html);
}

// ─── Premium free-trial reminder ─────────────────────────────────────────────

// Sent once, ~a day before a Premium free trial converts to a paid subscription
// (see runPremiumTrialReminders in lib/premium.ts) — a card was collected up front,
// so without this warning the first a trialist hears about the charge is the charge
// itself. amountLabel/chargeDate come from the trialist's own live Stripe
// subscription, never guessed, since it also has to be right for annual trials.
//
// planName is the TIER the trial actually converts to ("Plus" or "Premium"),
// resolved by the caller from the same live subscription the amount comes from.
// A billing email that names the wrong plan next to the right price is the one
// thing a trialist will read as a mistake — or as a charge for something they
// didn't buy.
function trialReminderFooter(planName: string): string {
  return `<tr><td style="padding:16px 32px 26px;border-top:1px solid #233047;font-size:12px;color:#6b7585">
    You're getting this because you started a RiftCompare ${planName} free trial.<br/>
    RiftCompare · Riftbound card price comparison.
  </td></tr>`;
}

export async function sendTrialEndingEmail(
  to: string,
  chargeDate: Date,
  amountLabel: string,
  planName = "Premium",
  /** During the intro offer: the full price the plan moves to afterwards, e.g. "$9.99/month after 3 months". */
  thenLabel?: string,
): Promise<boolean> {
  const dateLabel = chargeDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const charge = thenLabel ? `${amountLabel} (then ${thenLabel})` : amountLabel;
  const inner = `
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">
      Your RiftCompare ${planName} free trial ends on <strong style="color:#e6ebf2">${dateLabel}</strong>. Unless you cancel
      before then, the card on file will be charged ${charge} and your subscription continues automatically.
    </td></tr>
    <tr><td style="padding:4px 32px 24px"><a href="${SITE_URL}/premium" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">Manage subscription</a></td></tr>`;
  return sendEmail(
    to,
    `Your RiftCompare ${planName} trial ends ${dateLabel}`,
    emailShell("Your free trial is ending soon", inner, trialReminderFooter(planName)),
  );
}

// The trial reminder for a trial whose renewal is already OFF (2026-09-24).
// It used to get the charge warning above, which was false. This says what is
// true — it ends on <date> and nothing is charged — and, once, what keeping it
// would cost, linking to /premium?keep=1, where keeping is a deliberate click
// (the link itself changes nothing: mail scanners prefetch links).
export async function sendTrialEndingNoChargeEmail(
  to: string,
  endsAt: Date,
  planName = "Premium",
  keepLine: string | null = null,
): Promise<boolean> {
  const dateLabel = endsAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const inner = `
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">
      Your RiftCompare ${planName} free trial ends on <strong style="color:#e6ebf2">${dateLabel}</strong>. You turned off
      renewal, so <strong style="color:#e6ebf2">nothing will be charged</strong> and ${planName} simply stops then.
    </td></tr>
    <tr><td style="padding:0 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">
      If you'd like to keep it${keepLine ? `, it's ${keepLine}` : ""} — one click on your account page. Otherwise there's nothing to do.
    </td></tr>
    <tr><td style="padding:4px 32px 24px"><a href="${SITE_URL}/premium?keep=1#keep" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">Keep ${planName}</a></td></tr>`;
  return sendEmail(
    to,
    `Your RiftCompare ${planName} trial ends ${dateLabel} — no charge`,
    emailShell("Your free trial ends soon", inner, trialReminderFooter(planName)),
  );
}

// ─── Premium checkout-recovery (one-time) ────────────────────────────────────

// Sent ONCE, roughly a day after someone opens Stripe checkout for Premium but
// never completes it (see runCheckoutRecovery in lib/premium.ts) — the single
// highest-intent audience on the site, so this is worth a nudge no scheduled
// email covers. NOT an unsubscribe-bearing marketing send: it's tied to one
// action the recipient themselves took, same category as the trial-ending
// notice above, and the copy itself states it will not repeat — so no footer
// opt-out link is offered (mirrors trialReminderFooter's shape exactly).
//
// The list is the 2026-09-25 lineup in buyer's words (the rows of
// TierComparisonTable's TIER_COMPARISON a payment changes) — kept as a
// separate plain-string list because an email template has no business
// importing React component modules. It leads with "No ads on any page",
// Plus's headline, and names no retired tool (tests/ad-free-tier.test.ts).
const CHECKOUT_RECOVERY_TOOLS = [
  "No ads on any page",
  "Every deal: the full Deal Finder and Rising Cards lists",
  "An email naming the store when a card you watch hits your target price",
  "Premium: Best Basket, the cheapest delivered order for your whole deck, watchlist or binder",
  "Premium: Demand Finder, the cards players are searching for and opening most",
];

function checkoutRecoveryFooter(name: string): string {
  return `<tr><td style="padding:16px 32px 26px;border-top:1px solid #233047;font-size:12px;color:#6b7585">
    You're getting this once because you started RiftCompare ${name} checkout. We won't send it again.<br/>
    RiftCompare · Riftbound card price comparison.
  </td></tr>`;
}

// `tier` is the plan the abandoned checkout was for (PremiumClick.tier, read by
// runCheckoutRecovery) — the email names that plan and quotes ITS price. A Plus
// abandoner used to be told they had started Premium, at Premium's price.
export async function sendCheckoutRecoveryEmail(
  to: string,
  trialDays: number,
  fromLine: string,
  tier: PremiumTierKey = "premium",
): Promise<boolean> {
  const name = TIER_NAMES[tier];
  const toolList = CHECKOUT_RECOVERY_TOOLS.map(
    (t) => `<li style="margin:4px 0">${t}</li>`
  ).join("");
  const trialLine =
    trialDays > 0
      ? `Your ${trialDays}-day free trial is still available — $0 today, then ${fromLine}.`
      : `${name} is ${fromLine}.`;
  const otherPlan =
    tier === "premium"
      ? "Prefer something lighter? Plus is the cheaper plan, on the same page."
      : "Buying a whole deck? Premium adds Best Basket's store-by-store plan and Demand Finder, on the same page.";
  const inner = `
    <tr><td style="padding:8px 32px 4px;font-size:14px;line-height:1.6;color:#b8c0cc">
      You started signing up for RiftCompare ${name} but didn't finish checkout. ${trialLine} Plus and Premium are
      both ad-free and show every deal; Premium also works out the cheapest way to buy a whole want-list or decklist,
      postage included. ${otherPlan}
    </td></tr>
    <tr><td style="padding:4px 32px 8px;font-size:14px;line-height:1.6;color:#b8c0cc">
      <ul style="margin:8px 0;padding-left:20px;color:#e6ebf2">${toolList}</ul>
    </td></tr>
    <tr><td style="padding:4px 32px 24px"><a href="${SITE_URL}/premium?src=recovery" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">Finish setting up ${name}</a></td></tr>`;
  return sendEmail(
    to,
    trialDays > 0 ? `Your RiftCompare ${name} free trial is still waiting` : `Your RiftCompare ${name} checkout is still waiting`,
    emailShell(`Still want ${name}?`, inner, checkoutRecoveryFooter(name))
  );
}

// ─── Welcome email to a new account (one-time) ────────────────────────────────
// Sent ONCE, within about an hour of an account being created (runWelcomeEmails
// in lib/welcome-email.ts, 2026-09-23). Before this, a new account got no email
// at all — the only welcome was a checklist on /profile that nobody who signed
// up from a card page ever saw.
//
// WHAT IT IS FOR: the three things a free account does that a visitor cannot,
// in the order most people will get value from them, and then — one short
// block, not the headline — what Premium adds, with its trial stated the way
// every other surface states it (premiumZeroToday / premiumFromLine, never a
// typed price; the trial only when the account is actually eligible).
//
// Same category as the checkout-recovery email: tied to one action the
// recipient took, sent once, and the footer says so; no opt-out link because
// there is nothing further to opt out of.
export interface WelcomeEmailOpts {
  displayName: string;
  trialDays: number; // 0 = no trial available (disabled, or somehow already used)
  fromLine: string; // premiumFromLine()
  zeroToday: string; // premiumZeroToday()
}

const WELCOME_UTM = "utm_source=email&utm_medium=email&utm_campaign=welcome";

export function buildWelcomeEmail(opts: WelcomeEmailOpts): { subject: string; heading: string; html: string } {
  const name = escapeHtml(opts.displayName.trim().split(/\s+/)[0] || "there");
  const link = (path: string, label: string) =>
    `<a href="${SITE_URL}${path}${path.includes("?") ? "&" : "?"}${WELCOME_UTM}" style="color:#34d17e;font-weight:700;text-decoration:none">${label}</a>`;
  const trialLine =
    opts.trialDays > 0
      ? `Try it free for ${opts.trialDays} days — ${opts.zeroToday}, then ${opts.fromLine}. Cancel before the trial ends and you pay nothing.`
      : `Premium is ${opts.fromLine}.`;
  const step = (n: number, title: string, body: string) =>
    `<tr><td style="padding:6px 32px;font-size:14px;line-height:1.6;color:#b8c0cc">
      <strong style="color:#e6ebf2">${n}. ${title}</strong><br/>${body}
    </td></tr>`;
  const inner = `
    <tr><td style="padding:8px 32px 8px;font-size:14px;line-height:1.6;color:#b8c0cc">
      Hi ${name}, your free account is ready. Three things it does that a visitor can't:
    </td></tr>
    ${step(1, "Watch a card", `Press <em>Watch price</em> on any card and we'll email you when its price drops. ${link("/browse", "Find a card&nbsp;→")}`)}
    ${step(2, "See today's top 3 deals", `Your account shows the three biggest deals in Deal Finder and the three top-ranked Rising Cards, updated daily. ${link("/tools/deal-finder", "Deal&nbsp;Finder&nbsp;→")} · ${link("/tools/rising", "Rising&nbsp;Cards&nbsp;→")}`)}
    ${step(3, "Track your collection", `Add the cards you own and see what they're worth today. ${link("/portfolio", "Your&nbsp;portfolio&nbsp;→")}`)}
    <tr><td style="padding:14px 32px 22px">
      <div style="border:1px solid #6b5a1f;border-radius:12px;padding:14px 16px;background:#1a1810">
        <div style="font-size:13px;line-height:1.55;color:#d8cfa8">
          <strong style="color:#f3c969">Want every deal, not just the top three?</strong> Plus and Premium both come with:
          <ul style="margin:6px 0;padding-left:18px">
            <li>No ads on any page</li>
            <li>Every deal: the full Deal Finder and Rising Cards lists</li>
            <li>An email naming the store when a card you watch hits your target price</li>
          </ul>
          Premium adds Best Basket: the cheapest delivered order for your whole deck or watchlist, skipping the
          cards you already own. It also opens Demand Finder, the full list of cards players are searching for and
          opening. ${trialLine}
        </div>
        <a href="${SITE_URL}/premium?src=welcome" style="display:inline-block;margin-top:10px;background:#f3c969;color:#1a1405;font-size:13px;font-weight:700;text-decoration:none;padding:8px 16px;border-radius:8px">See Premium</a>
      </div>
    </td></tr>`;
  const heading = "Welcome to RiftCompare";
  return {
    subject: "Welcome to RiftCompare — here's what your account does",
    heading,
    html: emailShell(heading, inner, welcomeFooter()),
  };
}

function welcomeFooter(): string {
  return `<tr><td style="padding:16px 32px 26px;border-top:1px solid #233047;font-size:12px;color:#6b7585">
    You're getting this once because you created a RiftCompare account. We won't send it again.<br/>
    RiftCompare · Riftbound card price comparison.
  </td></tr>`;
}

export async function sendWelcomeEmail(to: string, opts: WelcomeEmailOpts): Promise<boolean> {
  const { subject, html } = buildWelcomeEmail(opts);
  return sendEmail(to, subject, html);
}

// The welcome for an account that is ALREADY IN A TRIAL (2026-09-24). Twelve of
// the first sixteen trialists started their trial the day they signed up, and
// got the free-account welcome above: a "Premium is $9.99/month" pitch, a "See
// Premium" button to the page where Cancel lives, and "your account shows the
// three biggest deals" — false for a trialist, who sees them all. This is the
// enrolment confirmation instead: the plan, when the trial ends, what the first
// charge is (read from the subscription, so intro-aware), the reminder, where
// to manage it — and three first steps into what they now have. A trial whose
// renewal is already off says so and never says "will convert".
export interface TrialWelcomeEmailOpts {
  displayName: string;
  planName: string;
  endsAt: Date;
  chargeLine: string | null;
  cancelling: boolean;
}

const WELCOME_TRIAL_UTM = "utm_source=email&utm_medium=email&utm_campaign=welcome-trial";

export function buildTrialWelcomeEmail(opts: TrialWelcomeEmailOpts): { subject: string; heading: string; html: string } {
  const name = escapeHtml(opts.displayName.trim().split(/\s+/)[0] || "there");
  const dateLabel = opts.endsAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const link = (path: string, label: string) =>
    `<a href="${SITE_URL}${path}${path.includes("?") ? "&" : "?"}${WELCOME_TRIAL_UTM}" style="color:#34d17e;font-weight:700;text-decoration:none">${label}</a>`;
  const step = (n: number, title: string, body: string) =>
    `<tr><td style="padding:6px 32px;font-size:14px;line-height:1.6;color:#b8c0cc">
      <strong style="color:#e6ebf2">${n}. ${title}</strong><br/>${body}
    </td></tr>`;
  const terms = opts.cancelling
    ? `Your ${opts.planName} trial runs until <strong style="color:#e6ebf2">${dateLabel}</strong>. Renewal is off, so you won't be charged — it simply ends then.`
    : `Your ${opts.planName} trial runs until <strong style="color:#e6ebf2">${dateLabel}</strong>. Then it's ${opts.chargeLine ?? "your plan's price"} unless you cancel. We'll email you a day or two before.`;
  const inner = `
    <tr><td style="padding:8px 32px 8px;font-size:14px;line-height:1.6;color:#b8c0cc">
      Hi ${name}, everything in ${opts.planName} is unlocked. ${terms}
    </td></tr>
    ${step(1, "No ads on any page", `Every page is ad-free from now on, on the website and in the app. Nothing to switch on.`)}
    ${step(2, "Every deal, not just three", `The full Deal Finder list: every card cheaper than TCGplayer market at a real store, which you can narrow to only the cards you watch or own. ${link("/tools/deal-finder?mine=watch", "Deal&nbsp;Finder&nbsp;→")}`)}
    ${step(3, "Set a target price", `Watch a card and tell us what you'd pay. After every price update we check every tracked store in your country and email you the store when it's there. ${link("/watching", "Your&nbsp;watchlist&nbsp;→")}`)}
    ${
      opts.planName === "Plus"
        ? ""
        : `${step(4, "Buy a whole list for less", `Send a decklist or your watchlist to Best Basket, skip the copies you own, and get the cheapest delivered order. ${link("/tools/best-basket", "Best&nbsp;Basket&nbsp;→")}`)}
    ${step(5, "See what players are hunting for", `Demand Finder ranks the cards most searched and most viewed over the last 7 or 30 days. ${link("/tools/demand", "Demand&nbsp;Finder&nbsp;→")}`)}`
    }
    <tr><td style="padding:10px 32px 22px;font-size:13px;line-height:1.55;color:#8b95a5">
      Manage or cancel any time: ${link("/premium", "your account page")}.
    </td></tr>`;
  const heading = `Your ${opts.planName} trial has started`;
  return {
    subject: opts.cancelling
      ? `Your RiftCompare ${opts.planName} trial — runs until ${dateLabel}, no charge`
      : `Your RiftCompare ${opts.planName} trial — runs until ${dateLabel}`,
    heading,
    html: emailShell(heading, inner, welcomeFooter()),
  };
}

export async function sendTrialWelcomeEmail(to: string, opts: TrialWelcomeEmailOpts): Promise<boolean> {
  const { subject, html } = buildTrialWelcomeEmail(opts);
  return sendEmail(to, subject, html);
}

// ─── One-off Premium offer to free-tier accounts ──────────────────────────────
// See lib/premium-offer.ts for the audience, idempotency and the offer itself.
//
// HONESTY RULES THIS TEMPLATE HOLDS ITSELF TO, because the site's own tests pin
// them elsewhere (tests/premium-zero-today.test.ts): a real deadline date, never
// a countdown or "only N left"; the price is premiumFromLine(), never a typed
// number; and the mechanism is stated plainly — the extra days are added BY HAND
// after the subscription lands, so the email must never imply checkout itself
// grants a month. Two wordings, because two things are true:
//   • trialDays > 0  — Stripe will run its normal trial; the owner then extends
//     it to `offerDays` in total. "$0 today" is true here.
//   • trialDays = 0  — this account already used its one trial, so checkout
//     charges immediately; the owner adds a free month ON TOP. "$0 today" would
//     be false here, so it isn't said.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface PremiumOfferEmailOpts {
  displayName: string;
  trialDays: number; // 0 = trial already used
  offerDays: number; // what the trial is extended to, in total
  offerEnds: string; // human-readable deadline, e.g. "30 September 2026"
  unsubUrl: string;
  via?: "brevo" | "resend";
}

export function premiumOfferSubject(opts: Pick<PremiumOfferEmailOpts, "trialDays">): string {
  return opts.trialDays > 0
    ? "A full month of RiftCompare Premium, on us"
    : "A free month of RiftCompare Premium, on us";
}

export function buildPremiumOfferEmail(opts: PremiumOfferEmailOpts, fromLine: string): { subject: string; heading: string; html: string } {
  // A display name that is really just an email address reads oddly after
  // "Hi" — fall back to a plain greeting rather than "Hi bill.j@…".
  const name = opts.displayName.includes("@") ? "" : escapeHtml(opts.displayName.trim().split(/\s+/)[0] ?? "");
  const greeting = name ? `Hi ${name},` : "Hi there,";
  const ctaUrl = `${SITE_URL}/premium?src=offer&utm_source=email&utm_medium=email&utm_campaign=premium-offer`;
  const toolList = CHECKOUT_RECOVERY_TOOLS.map((t) => `<li style="margin:4px 0">${t}</li>`).join("");
  const ends = escapeHtml(opts.offerEnds);

  const offerBlock =
    opts.trialDays > 0
      ? `Premium normally starts with a ${opts.trialDays}-day free trial. <strong style="color:#fff">Start yours before ${ends} and we'll extend it to a full ${opts.offerDays} days.</strong> It's $0 today, then ${fromLine} — and you can cancel any time during the trial and pay nothing.`
      : `You've already used a free trial, so Premium bills from day one. <strong style="color:#fff">Subscribe before ${ends} and we'll add a free month on top</strong> — ${opts.offerDays} extra days on your subscription, at no charge. Premium is ${fromLine}, and you can cancel any time.`;

  const heading = opts.trialDays > 0 ? "Try Premium for a full month, free" : "A free month of Premium, on us";
  const inner = `
    <tr><td style="padding:8px 32px 4px;font-size:14px;line-height:1.6;color:#b8c0cc">
      ${greeting}
    </td></tr>
    <tr><td style="padding:4px 32px 4px;font-size:14px;line-height:1.6;color:#b8c0cc">
      Thanks for using RiftCompare. Price comparison, alerts and your portfolio stay free — Premium is for when
      you're buying more than one card at a time and want the cheapest way to get the lot:
    </td></tr>
    <tr><td style="padding:4px 32px 8px;font-size:14px;line-height:1.6;color:#b8c0cc">
      <ul style="margin:8px 0;padding-left:20px;color:#e6ebf2">${toolList}</ul>
    </td></tr>
    <tr><td style="padding:4px 32px 8px;font-size:14px;line-height:1.6;color:#b8c0cc">
      ${offerBlock}
    </td></tr>
    <tr><td style="padding:4px 32px 12px;font-size:13px;line-height:1.6;color:#9aa4b2">
      How it works: there's nothing to enter at checkout. Once your subscription is in, we add the extra days to your
      account by hand — usually within a day or two — and email you when it's done.
    </td></tr>
    <tr><td style="padding:4px 32px 24px"><a href="${ctaUrl}" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">${opts.trialDays > 0 ? "Start my free month" : "Claim my free month"}</a></td></tr>`;

  return { subject: premiumOfferSubject(opts), heading, html: emailShell(heading, inner, announcementFooter(opts.unsubUrl)) };
}

export async function sendPremiumOfferEmail(to: string, opts: PremiumOfferEmailOpts): Promise<boolean> {
  const { subject, html } = buildPremiumOfferEmail(opts, premiumFromLine());
  return opts.via === "resend" ? sendEmail(to, subject, html) : sendEmailBrevo(to, subject, html);
}

// One-off "N days of Premium, free, no card" win-back email. See
// lib/premium-winback.ts's header for how this differs from the offer above:
// this one grants the moment the link is claimed, with no checkout at all.
export interface PremiumWinbackEmailOpts {
  displayName: string;
  days: number; // how many days the claim link grants
  claimUrl: string;
  claimWindowDays: number; // how long the link stays live before it expires
  unsubUrl: string;
  via?: "brevo" | "resend";
}

export function premiumWinbackSubject(days: number): string {
  return `${days} days of RiftCompare Premium, free — no card needed`;
}

export function buildPremiumWinbackEmail(opts: PremiumWinbackEmailOpts): { subject: string; heading: string; html: string } {
  const name = opts.displayName.includes("@") ? "" : escapeHtml(opts.displayName.trim().split(/\s+/)[0] ?? "");
  const greeting = name ? `Hi ${name},` : "Hi there,";
  const heading = `${opts.days} days of Premium, on us`;
  const inner = `
    <tr><td style="padding:8px 32px 4px;font-size:14px;line-height:1.6;color:#b8c0cc">
      ${greeting}
    </td></tr>
    <tr><td style="padding:4px 32px 4px;font-size:14px;line-height:1.6;color:#b8c0cc">
      You joined RiftCompare recently, so here's a proper look at what Premium adds on top of the free tools you're
      already using: no ads on any page, the full Deal Finder and Rising Cards lists, target-price alerts that name
      the store, Best Basket's cheapest delivered order for a whole deck, watchlist or binder, and Demand Finder's
      most searched and most viewed cards.
    </td></tr>
    <tr><td style="padding:4px 32px 8px;font-size:14px;line-height:1.6;color:#b8c0cc">
      <strong style="color:#fff">${opts.days} days, completely free — no card required, nothing to cancel.</strong>
      Click below once to switch it on for your account. The link works once, and it's live for the next
      ${opts.claimWindowDays} days.
    </td></tr>
    <tr><td style="padding:4px 32px 24px"><a href="${opts.claimUrl}" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">Claim my ${opts.days} free days</a></td></tr>`;

  return { subject: premiumWinbackSubject(opts.days), heading, html: emailShell(heading, inner, announcementFooter(opts.unsubUrl)) };
}

export async function sendPremiumWinbackEmail(to: string, opts: PremiumWinbackEmailOpts): Promise<boolean> {
  const { subject, html } = buildPremiumWinbackEmail(opts);
  return opts.via === "resend" ? sendEmail(to, subject, html) : sendEmailBrevo(to, subject, html);
}

// ── Store consulting (/stores/consulting) ────────────────────────────────────

function consultFooter(): string {
  return `<tr><td style="padding:16px 32px 26px;border-top:1px solid #233047;font-size:12px;color:#6b7585">
    You're getting this because you booked a paid consulting session with ${SITE_NAME}.
    Reply to this email to reach us directly — it's a real inbox.
  </td></tr>`;
}

export interface ConsultConfirmationOpts {
  storeName: string;
  contactName: string;
  amountCents: number;
  currency: string;
  durationMin: number;
  replyHours: number;
  /** Stripe's hosted tax invoice, when the webhook could read one off the session. */
  invoiceUrl?: string | null;
  /** Set only when a self-serve scheduling link is configured. */
  schedulingUrl?: string | null;
  /** Whatever times they said suited them, echoed back so they can correct us. */
  preferredTimes?: string | null;
}

// The store's receipt-and-next-steps email, sent from the webhook once the
// payment has actually cleared. Says exactly one thing about what happens next,
// and which thing depends on whether a scheduling link exists — never promises a
// booking widget that isn't configured.
export async function sendConsultConfirmationEmail(to: string, opts: ConsultConfirmationOpts): Promise<boolean> {
  const paid = formatMoney(opts.amountCents, opts.currency.toUpperCase());
  const next = opts.schedulingUrl
    ? `<tr><td style="padding:4px 32px 24px"><a href="${opts.schedulingUrl}" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">Pick your time</a></td></tr>`
    : `<tr><td style="padding:4px 32px 20px;font-size:14px;line-height:1.6;color:#b8c0cc">
        We'll reply within ${opts.replyHours} hours with a couple of times that work${
          opts.preferredTimes ? `, starting from the windows you gave us: <em style="color:#e8eaee">${opts.preferredTimes}</em>` : ""
        }. If something suits you better, just reply to this email.
      </td></tr>`;

  const inner = `
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">
      Thanks ${opts.contactName} — your ${opts.durationMin}-minute session for
      <strong style="color:#fff">${opts.storeName}</strong> is paid and booked.
    </td></tr>
    <tr><td style="padding:0 32px 16px">
      <div style="border:1px solid #233047;border-radius:12px;padding:14px 16px;font-size:13px;line-height:1.7;color:#b8c0cc">
        <div><span style="color:#6b7585">Paid</span> &nbsp;<strong style="color:#fff">${paid} ${opts.currency.toUpperCase()}</strong></div>
        <div><span style="color:#6b7585">Session</span> &nbsp;${opts.durationMin} minutes, one-to-one, video call</div>
        ${opts.invoiceUrl ? `<div style="margin-top:8px"><a href="${opts.invoiceUrl}" style="color:#34d17e;text-decoration:underline">Download your tax invoice</a></div>` : ""}
      </div>
    </td></tr>
    <tr><td style="padding:4px 32px 8px;font-size:14px;line-height:1.6;color:#b8c0cc">
      <strong style="color:#fff">Before we talk</strong>, we'll pull your store's live position from the same
      data the public comparison runs on — where you're cheapest, where you're beaten, and by how much.
      You don't need to send us a spreadsheet.
    </td></tr>
    ${next}`;

  return sendEmail(
    to,
    `Your ${SITE_NAME} consulting session is booked — ${opts.storeName}`,
    emailShell("Booked — here's what happens next", inner, consultFooter())
  );
}

// The owner's own "someone just paid" alert. Deliberately plain and dense: it
// exists to be actioned from a phone, not admired.
export async function sendConsultOwnerAlertEmail(
  to: string,
  opts: {
    storeName: string;
    storeUrl?: string | null;
    contactName: string;
    email: string;
    country: string;
    amountCents: number;
    currency: string;
    goals?: string | null;
    preferredTimes?: string | null;
    adminUrl: string;
  }
): Promise<boolean> {
  const row = (label: string, value: string) =>
    `<div><span style="color:#6b7585">${label}</span> &nbsp;<span style="color:#e8eaee">${value}</span></div>`;
  const inner = `
    <tr><td style="padding:8px 32px 16px">
      <div style="border:1px solid #233047;border-radius:12px;padding:14px 16px;font-size:13px;line-height:1.8">
        ${row("Store", opts.storeName)}
        ${opts.storeUrl ? row("Site", `<a href="${opts.storeUrl}" style="color:#34d17e">${opts.storeUrl}</a>`) : ""}
        ${row("Contact", `${opts.contactName} &lt;${opts.email}&gt;`)}
        ${row("Market", opts.country)}
        ${row("Paid", `${formatMoney(opts.amountCents, opts.currency.toUpperCase())} ${opts.currency.toUpperCase()}`)}
        ${opts.preferredTimes ? row("Times", opts.preferredTimes) : ""}
      </div>
    </td></tr>
    ${
      opts.goals
        ? `<tr><td style="padding:0 32px 16px;font-size:13px;line-height:1.6;color:#b8c0cc">
            <strong style="color:#fff">What they want:</strong><br/>${opts.goals}
          </td></tr>`
        : ""
    }
    <tr><td style="padding:4px 32px 24px"><a href="${opts.adminUrl}" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">Open bookings</a></td></tr>`;
  return sendEmail(
    to,
    `💼 Consulting booked: ${opts.storeName} (${formatMoney(opts.amountCents, opts.currency.toUpperCase())})`,
    emailShell("New consulting booking", inner, consultFooter())
  );
}

// Sent once on first signup so subscribers hear from us immediately (and get the
// unsubscribe link up front) instead of silence until Friday.
// `source` is the NewsletterSubscriber.source the route stored. A "radiance-launch"
// signup came from a "Get an email the day Radiance prices go live" card, so its
// welcome confirms THAT promise first — release-day.ts sends the email itself on
// the day — instead of only describing the weekly summary it also joined
// (2026-09-23). Every other source gets the unchanged welcome.
export async function sendNewsletterWelcomeEmail(to: string, unsubUrl: string, source?: string): Promise<boolean> {
  const releaseDay = new Date(`${RADIANCE_RELEASE_DATE}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
  const radianceLine =
    source === "radiance-launch"
      ? `
    <tr><td style="padding:8px 32px 0;font-size:14px;line-height:1.6;color:#e8eaee">
      <strong>You'll get one email on ${releaseDay}</strong>, the day Riftbound Radiance releases, as soon as its card prices are live.
    </td></tr>`
      : "";
  const inner = `${radianceLine}
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">
      You're on the list — every week you'll get the ${SITE_NAME} Index summary: the cards that spiked,
      the cards that dropped, and where the best value is across AU, US, UK, SG, CA and EU stores.
      The next edition lands this Saturday morning (Sydney time).
    </td></tr>
    <tr><td style="padding:4px 32px 24px"><a href="${SITE_URL}/movers?utm_source=newsletter&utm_medium=email&utm_campaign=welcome" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">See this week's movers</a></td></tr>`;
  return sendEmail(to, `You're on the ${SITE_NAME} weekly Index summary`, emailShell("Welcome aboard", inner, newsletterFooter(unsubUrl)));
}

// ─── Wrong-price report fixed (thank-you) ────────────────────────────────────

// Sent when an admin moves a PriceReport to FIXED (see
// app/api/admin/price-reports and shouldNotifyReporter in lib/price-report.ts),
// to the address the reporter volunteered — or their account's, only if it is
// verified. Until 2026-09-23 a reporter never heard back, and being told "you
// were right, it's fixed" is what makes someone report the next one too.
//
// TRANSACTIONAL, like the trial and checkout notices above: tied to one thing
// the recipient did, so no opt-out link and no account CTA (accountCtaBlock's
// own header rules it out of transactional sends). The footer promises nothing
// about "again": a report reopened and fixed a second time sends a second one,
// on purpose (see shouldNotifyReporter), so "we won't email you about this
// report again" would be false exactly then.
//
// IT CLAIMS ONLY WHAT FIXED MEANS (2026-09-23): an admin marked the report
// fixed. Not that the page already shows it — a card page revalidates daily
// (revalidate = 86400), sealed groups sit behind a 48h data cache and a
// 15-minute memo until the next import busts them, and some fixes only land
// with that import — hence "it can take up to a day", and a button that says
// "See it on RiftCompare" rather than "See the corrected price", which an
// out-of-stock or broken-link report never had. The noun follows the report's
// issue for the same reason (issueNoun): "the <store> link you reported".
//
// Nothing the reporter typed reaches it. The route passes a store name only when
// it is ours (a null storeName drops it), and the item name is our tile or card
// name. Both are escaped regardless — a setless sealed group's name is a
// store's listing title.
function priceReportFixedFooter(): string {
  return `<tr><td style="padding:16px 32px 26px;border-top:1px solid #233047;font-size:12px;color:#6b7585">
    You're getting this because you reported a problem with a listing on ${SITE_NAME} and it has now been fixed.<br/>
    RiftCompare · Riftbound card price comparison.
  </td></tr>`;
}

export interface PriceReportFixedOpts {
  itemName: string; // the card or sealed product the report was about, as the site names it
  storeName: string | null; // the store whose listing was wrong — null when we can't vouch for the name
  issue: string; // the report's issue code (lib/price-report ISSUES), which picks the noun
  url: string; // absolute link to that item on the site
}

export async function sendPriceReportFixedEmail(to: string, opts: PriceReportFixedOpts): Promise<boolean> {
  // "the Cherry Collectables price" / "the link" — the store, when we have one
  // we trust, qualifies the noun rather than getting a clause of its own.
  const what = `${opts.storeName ? `${opts.storeName} ` : ""}${issueNoun(opts.issue)}`;
  const item = escapeHtml(opts.itemName);
  const inner = `
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">
      Thanks — the ${escapeHtml(what)} you reported for <strong style="color:#fff">${item}</strong> has been fixed.
      It can take up to a day to show everywhere on the site.
    </td></tr>
    <tr><td style="padding:4px 32px 24px"><a href="${escapeHtml(opts.url)}" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">See it on ${SITE_NAME}</a></td></tr>`;
  return sendEmail(
    to,
    `Fixed: the ${what} you reported for ${opts.itemName}`,
    emailShell("Your report is fixed", inner, priceReportFixedFooter())
  );
}
