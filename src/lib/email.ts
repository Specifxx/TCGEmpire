import { SITE_NAME, SITE_URL } from "./site";
import { formatMoney } from "./format";
import { currencyOf, type Country } from "./country";

export function isEmailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY;
}

// Send a transactional email via Resend's REST API. Requires RESEND_API_KEY (and
// ideally a verified sender in EMAIL_FROM) to actually deliver; otherwise it
// no-ops and logs, so the rest of the app keeps working without email configured.
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`[email] RESEND_API_KEY not set — "${subject}" to ${to} was NOT sent.`);
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
    if (!res.ok) console.warn(`[email] Resend returned ${res.status} for "${subject}".`);
    return res.ok;
  } catch (e) {
    console.warn("[email] send failed:", e);
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
    return false;
  }
  const sender = parseFrom(process.env.EMAIL_FROM ?? `${SITE_NAME} <noreply@riftcompare.com>`);
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html }),
    });
    if (!res.ok) console.warn(`[email] Brevo returned ${res.status} for "${subject}".`);
    return res.ok;
  } catch (e) {
    console.warn("[email] Brevo send failed:", e);
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

export interface PriceDropItem extends AlertCard {
  oldCents: number;
  newCents: number;
  market: Country;
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

// One row in the price-drop table.
function dropRow(item: PriceDropItem): string {
  const cur = currencyOf(item.market);
  const pct = item.oldCents > 0 ? Math.round(((item.oldCents - item.newCents) / item.oldCents) * 100) : 0;
  return `<tr><td style="padding:12px 0;border-bottom:1px solid #233047">
    <a href="${item.url}" style="color:#fff;font-weight:700;text-decoration:none;font-size:15px">${item.name}</a>
    <div style="font-size:12px;color:#6b7585;margin-top:2px">${item.setCode} · ${item.collectorNumber}</div>
    <div style="margin-top:6px;font-size:14px;color:#b8c0cc">
      <span style="color:#6b7585;text-decoration:line-through">${formatMoney(item.oldCents, cur)}</span>
      &nbsp;→&nbsp;<span style="color:#34d17e;font-weight:700">${formatMoney(item.newCents, cur)}</span>
      ${pct > 0 ? `&nbsp;<span style="background:#13351f;color:#34d17e;font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px">-${pct}%</span>` : ""}
    </div>
  </td></tr>`;
}

// The daily "a card on your wishlist got cheaper" email. Lists every card that
// dropped since the last check in one message.
// `anonymous` = this address has no linked account (PriceAlert.userId is null).
// Only THOSE recipients get the account CTA — its "your existing alerts come
// with you" promise is claimAlertsForUser's adopt-by-email behavior, which is
// meaningless (and the CTA is pure noise) for someone already signed up.
export async function sendPriceDropEmail(to: string, items: PriceDropItem[], unsubUrl: string, anonymous = false): Promise<boolean> {
  const count = items.length;
  const heading = count === 1 ? "A wishlist card just got cheaper" : `${count} wishlist cards just got cheaper`;
  const intro = `Good news — ${count === 1 ? "a card you're watching" : "some cards you're watching"} dropped in price:`;
  const inner = `
    <tr><td style="padding:8px 32px 4px;font-size:14px;line-height:1.6;color:#b8c0cc">${intro}</td></tr>
    <tr><td style="padding:4px 32px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items.map(dropRow).join("")}</table></td></tr>
    <tr><td style="padding:4px 32px 24px"><a href="${SITE_URL}/browse" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">Browse cards</a></td></tr>
    ${anonymous ? accountCtaBlock("price-drop", "Manage your price watches with a free account — your existing alerts come with you automatically.") : ""}`;
  const subject = count === 1 ? `Price drop: ${items[0]!.name} is now ${formatMoney(items[0]!.newCents, currencyOf(items[0]!.market))}` : `Price drops on ${count} of your wishlist cards`;
  return sendEmail(to, subject, emailShell(heading, inner, alertFooter(unsubUrl)));
}

// Sent once when someone subscribes via the wishlist pop-up, confirming the watch
// and surfacing the unsubscribe link up front.
export async function sendAlertConfirmationEmail(to: string, cardCount: number, unsubUrl: string, anonymous = false): Promise<boolean> {
  const inner = `
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">
      You're all set — we'll email you whenever the price drops on
      ${cardCount === 1 ? "the card" : `any of the ${cardCount} cards`} on your wishlist. We check prices once a day.
    </td></tr>
    <tr><td style="padding:4px 32px 24px"><a href="${SITE_URL}/browse" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">Browse cards</a></td></tr>
    ${anonymous ? accountCtaBlock("alert-confirm", "Manage your price watches with a free account — your existing alerts come with you automatically.") : ""}`;
  return sendEmail(to, "You're watching your RiftCompare wishlist for price drops", emailShell("Price-drop alerts are on", inner, alertFooter(unsubUrl)));
}

// ─── Arbitrage Alerts (Premium daily digest) ─────────────────────────────────
// Reuses lib/arbitrage.ts's engine (see lib/arbitrage-alerts.ts for the cron
// that builds these) — same-market flips (buy low, sell high across stores/
// eBay/the Marketplace) plus cross-region gaps, in one daily email.

export interface ArbitrageAlertFlip {
  name: string;
  setCode: string;
  collectorNumber: string;
  url: string;
  currency: string;
  buyCents: number;
  buyStoreName: string;
  sellCents: number;
  sellName: string;
  netCents: number;
  marginPct: number;
}

export interface ArbitrageAlertGap {
  name: string;
  setCode: string;
  collectorNumber: string;
  url: string;
  homeCurrency: string;
  homeCents: number;
  awayLabel: string; // e.g. "US"
  awayCentsConverted: number;
  gapPct: number;
}

function arbitrageFooter(unsubUrl: string): string {
  return `<tr><td style="padding:16px 32px 26px;border-top:1px solid #233047;font-size:12px;color:#6b7585">
    You're getting this because you're a RiftCompare Premium member.<br/>
    <a href="${unsubUrl}" style="color:#9aa4b2;text-decoration:underline">Unsubscribe from Arbitrage Alerts</a> — this only turns off this digest, your subscription is unaffected. · RiftCompare Marketplace.
  </td></tr>`;
}

function flipRow(item: ArbitrageAlertFlip): string {
  return `<tr><td style="padding:12px 0;border-bottom:1px solid #233047">
    <a href="${item.url}" style="color:#fff;font-weight:700;text-decoration:none;font-size:15px">${item.name}</a>
    <div style="font-size:12px;color:#6b7585;margin-top:2px">${item.setCode} · ${item.collectorNumber}</div>
    <div style="margin-top:6px;font-size:14px;color:#b8c0cc">
      Buy ${formatMoney(item.buyCents, item.currency)} <span style="color:#6b7585">(${item.buyStoreName})</span>
      &nbsp;→&nbsp;Sell ${formatMoney(item.sellCents, item.currency)} <span style="color:#6b7585">(${item.sellName})</span>
      &nbsp;<span style="background:#13351f;color:#34d17e;font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px">+${formatMoney(item.netCents, item.currency)} · ${item.marginPct}%</span>
    </div>
  </td></tr>`;
}

function gapRow(item: ArbitrageAlertGap): string {
  return `<tr><td style="padding:12px 0;border-bottom:1px solid #233047">
    <a href="${item.url}" style="color:#fff;font-weight:700;text-decoration:none;font-size:15px">${item.name}</a>
    <div style="font-size:12px;color:#6b7585;margin-top:2px">${item.setCode} · ${item.collectorNumber}</div>
    <div style="margin-top:6px;font-size:14px;color:#b8c0cc">
      Your market ${formatMoney(item.homeCents, item.homeCurrency)}
      &nbsp;vs&nbsp;${item.awayLabel} ${formatMoney(item.awayCentsConverted, item.homeCurrency)} <span style="color:#6b7585">(converted)</span>
      &nbsp;<span style="background:#1e2a13;color:#a3e635;font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px">-${item.gapPct}%</span>
    </div>
  </td></tr>`;
}

// The daily digest itself. Either section may be empty — the caller (see
// runArbitrageAlerts) only sends when there's at least one item total, so this
// never has to render a section-less "nothing today" email.
export async function sendArbitrageAlertEmail(
  to: string,
  flips: ArbitrageAlertFlip[],
  gaps: ArbitrageAlertGap[],
  unsubUrl: string
): Promise<boolean> {
  const count = flips.length + gaps.length;
  const flipsBlock = flips.length
    ? `<tr><td style="padding:4px 32px 4px;font-size:13px;font-weight:700;color:#8b95a5;text-transform:uppercase;letter-spacing:.4px">Today's best flips</td></tr>
       <tr><td style="padding:0 32px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${flips.map(flipRow).join("")}</table></td></tr>`
    : "";
  const gapsBlock = gaps.length
    ? `<tr><td style="padding:12px 32px 4px;font-size:13px;font-weight:700;color:#8b95a5;text-transform:uppercase;letter-spacing:.4px">Cheaper in another market</td></tr>
       <tr><td style="padding:0 32px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${gaps.map(gapRow).join("")}</table></td></tr>
       <tr><td style="padding:2px 32px 4px;font-size:11px;color:#6b7585">Doesn't include international shipping, customs or whether the store ships overseas at all — check before you buy.</td></tr>`
    : "";
  const inner = `
    <tr><td style="padding:8px 32px 4px;font-size:14px;line-height:1.6;color:#b8c0cc">Today's top opportunities from the Deal Finder engine:</td></tr>
    ${flipsBlock}
    ${gapsBlock}
    <tr><td style="padding:8px 32px 24px"><a href="${SITE_URL}/tools/deal-finder" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">Open Deal Finder</a></td></tr>`;
  const subject = count === 1 ? "1 new arbitrage opportunity today" : `${count} new arbitrage opportunities today`;
  return sendEmail(to, subject, emailShell("Arbitrage Alerts", inner, arbitrageFooter(unsubUrl)));
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
    // card count (Vendetta: 235 printings vs a 166-card set). Labelling it "cards"
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
        `Booster boxes, packs and Proving Grounds kits — ranked by total delivered cost, with an at-RRP flag so you can see instantly whether a box is a fair price or a scalp.`,
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
// reusing lib/newsletter.ts's buildDigest), sent via Brevo instead of Resend.
export async function sendUserDigestEmail(to: string, subject: string, heading: string, inner: string, unsubUrl: string): Promise<boolean> {
  return sendEmailBrevo(to, subject, emailShell(heading, inner, accountDigestFooter(unsubUrl)));
}

// ─── Premium free-trial reminder ─────────────────────────────────────────────

// Sent once, ~a day before a Premium free trial converts to a paid subscription
// (see runPremiumTrialReminders in lib/premium.ts) — a card was collected up front,
// so without this warning the first a trialist hears about the charge is the charge
// itself. amountLabel/chargeDate come from the trialist's own live Stripe
// subscription, never guessed, since it also has to be right for annual trials.
function trialReminderFooter(): string {
  return `<tr><td style="padding:16px 32px 26px;border-top:1px solid #233047;font-size:12px;color:#6b7585">
    You're getting this because you started a RiftCompare Premium free trial.<br/>
    RiftCompare · Riftbound card price comparison.
  </td></tr>`;
}

export async function sendTrialEndingEmail(to: string, chargeDate: Date, amountLabel: string): Promise<boolean> {
  const dateLabel = chargeDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const inner = `
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">
      Your RiftCompare Premium free trial ends on <strong style="color:#e6ebf2">${dateLabel}</strong>. Unless you cancel
      before then, the card on file will be charged ${amountLabel} and your subscription continues automatically.
    </td></tr>
    <tr><td style="padding:4px 32px 24px"><a href="${SITE_URL}/premium" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">Manage subscription</a></td></tr>`;
  return sendEmail(to, `Your RiftCompare Premium trial ends ${dateLabel}`, emailShell("Your free trial is ending soon", inner, trialReminderFooter()));
}

// Sent once on first signup so subscribers hear from us immediately (and get the
// unsubscribe link up front) instead of silence until Friday.
export async function sendNewsletterWelcomeEmail(to: string, unsubUrl: string): Promise<boolean> {
  const inner = `
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">
      You're on the list — every week you'll get the ${SITE_NAME} Index summary: the cards that spiked,
      the cards that dropped, and where the best value is across AU, US, UK, SG and CA stores.
      The next edition lands this Saturday morning (Sydney time).
    </td></tr>
    <tr><td style="padding:4px 32px 24px"><a href="${SITE_URL}/movers?utm_source=newsletter&utm_medium=email&utm_campaign=welcome" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">See this week's movers</a></td></tr>`;
  return sendEmail(to, `You're on the ${SITE_NAME} weekly Index summary`, emailShell("Welcome aboard", inner, newsletterFooter(unsubUrl)));
}
