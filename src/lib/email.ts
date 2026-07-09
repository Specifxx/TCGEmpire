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

function emailShell(heading: string, inner: string, footer: string): string {
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
export async function sendPriceDropEmail(to: string, items: PriceDropItem[], unsubUrl: string): Promise<boolean> {
  const count = items.length;
  const heading = count === 1 ? "A wishlist card just got cheaper" : `${count} wishlist cards just got cheaper`;
  const intro = `Good news — ${count === 1 ? "a card you're watching" : "some cards you're watching"} dropped in price:`;
  const inner = `
    <tr><td style="padding:8px 32px 4px;font-size:14px;line-height:1.6;color:#b8c0cc">${intro}</td></tr>
    <tr><td style="padding:4px 32px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items.map(dropRow).join("")}</table></td></tr>
    <tr><td style="padding:4px 32px 24px"><a href="${SITE_URL}/wishlist" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">View your wishlist</a></td></tr>`;
  const subject = count === 1 ? `Price drop: ${items[0]!.name} is now ${formatMoney(items[0]!.newCents, currencyOf(items[0]!.market))}` : `Price drops on ${count} of your wishlist cards`;
  return sendEmail(to, subject, emailShell(heading, inner, alertFooter(unsubUrl)));
}

// Sent once when someone subscribes via the wishlist pop-up, confirming the watch
// and surfacing the unsubscribe link up front.
export async function sendAlertConfirmationEmail(to: string, cardCount: number, unsubUrl: string): Promise<boolean> {
  const inner = `
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">
      You're all set — we'll email you whenever the price drops on
      ${cardCount === 1 ? "the card" : `any of the ${cardCount} cards`} on your wishlist. We check prices once a day.
    </td></tr>
    <tr><td style="padding:4px 32px 24px"><a href="${SITE_URL}/wishlist" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">View your wishlist</a></td></tr>`;
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

// The weekly digest itself; `inner` is built by lib/newsletter.ts so the content
// (movers tables, Index summary) lives next to the data that produces it.
export async function sendNewsletterDigestEmail(to: string, subject: string, heading: string, inner: string, unsubUrl: string): Promise<boolean> {
  return sendEmail(to, subject, emailShell(heading, inner, newsletterFooter(unsubUrl)));
}

// One-off release-day blast for a new set (e.g. Vendetta, 31 Jul 2026). Sent to the
// countdown/newsletter list from a one-off script/cron on release day — the moment of
// peak buy-intent the countdown page promises. `setName`/`setSlug` keep it reusable for
// future sets.
export async function sendReleaseDayEmail(
  to: string,
  setName: string,
  setSlug: string,
  unsubUrl: string
): Promise<boolean> {
  const base = `${SITE_URL}/sets/${setSlug}?utm_source=newsletter&utm_medium=email&utm_campaign=release-day`;
  const inner = `
    <tr><td style="padding:8px 32px 16px;font-size:16px;line-height:1.6;color:#e6ebf2">
      <strong>${setName} is live.</strong> You asked us to tell you the moment prices went up — they're up now.
    </td></tr>
    <tr><td style="padding:0 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">
      We're comparing every ${setName} card across 60+ stores in AU, NZ, US and the UK, cheapest delivered price
      first — so you never overpay in the launch rush. Prices move fast on day one; grab what you need before the
      chase cards spike.
    </td></tr>
    <tr><td style="padding:4px 32px 24px"><a href="${base}" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">See every ${setName} price →</a></td></tr>`;
  return sendEmail(to, `${setName} is out — see every card's cheapest price`, emailShell(`${setName} is here`, inner, newsletterFooter(unsubUrl)));
}

// Sent once on first signup so subscribers hear from us immediately (and get the
// unsubscribe link up front) instead of silence until Friday.
export async function sendNewsletterWelcomeEmail(to: string, unsubUrl: string): Promise<boolean> {
  const inner = `
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">
      You're on the list — every week you'll get the ${SITE_NAME} Index summary: the cards that spiked,
      the cards that dropped, and where the best value is across AU, NZ, US and UK stores.
      The next edition lands this Saturday morning (Sydney time).
    </td></tr>
    <tr><td style="padding:4px 32px 24px"><a href="${SITE_URL}/movers?utm_source=newsletter&utm_medium=email&utm_campaign=welcome" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">See this week's movers</a></td></tr>`;
  return sendEmail(to, `You're on the ${SITE_NAME} weekly Index summary`, emailShell("Welcome aboard", inner, newsletterFooter(unsubUrl)));
}
