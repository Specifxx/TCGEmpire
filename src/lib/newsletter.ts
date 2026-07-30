import { randomUUID } from "crypto";
import { prisma } from "./db";
import { getPriceMovers, type Mover, type PriceMovers } from "./price-history";
import { sendNewsletterDigestEmail, isEmailEnabled } from "./email";
import { formatMoney } from "./format";
import { currencyOf, normalizeCountry, COUNTRIES, type Country } from "./country";
import { cardHref } from "./card-url";
import { SITE_URL } from "./site";
import { ebayAffiliateUrl } from "./affiliate";

// Per-market eBay domain, same convention as ArticleShopStrip/EbayBuyCta — NZ has
// no eBay of its own (eBay AU ships there).
const EBAY_DOMAIN: Record<Country, string> = {
  AU: "ebay.com.au",
  NZ: "ebay.com.au",
  US: "ebay.com",
  UK: "ebay.co.uk",
  SG: "ebay.com.sg",
  CA: "ebay.ca",
};

export interface NewsletterRunSummary {
  edition: string; // e.g. "2026-W24"
  subscribers: number; // total rows in the list
  due: number; // not yet sent this edition
  emails: number; // successfully delivered this run
  quietMarkets: string[]; // markets skipped for lack of movers
}

// ISO-8601 week key — one digest edition per calendar week, so reruns of the
// cron (or a manual trigger after a partial failure) never double-send.
export function editionKey(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay() || 7; // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day); // nearest Thursday decides the ISO year
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const utm = (path: string) => `${SITE_URL}${path}?utm_source=newsletter&utm_medium=email&utm_campaign=weekly-digest`;

const signedPct = (pct: number) => `${pct > 0 ? "+" : ""}${pct}%`;

// One card row in a digest section. Same visual language as the price-drop
// alert rows so the two emails read as one product. Every row carries TWO links:
// the internal card page (its own affiliate-wrapped store table once they land),
// and a direct eBay affiliate search — so a reader who buys straight from the
// email still credits our EPN commission, not just readers who click through
// to the site first.
function moverRow(m: Mover, currency: string, market: Country): string {
  const color = m.pct > 0 ? "#f08c4a" : "#34d17e";
  const ebayHref = ebayAffiliateUrl(
    `https://www.${EBAY_DOMAIN[market]}/sch/i.html?_nkw=${encodeURIComponent(`${m.card.name} Riftbound`)}`,
  );
  const ebayTagged = `${ebayHref}${ebayHref.includes("?") ? "&" : "?"}utm_source=newsletter&utm_medium=email&utm_campaign=weekly-digest`;
  return `<tr><td style="padding:10px 0;border-bottom:1px solid #233047">
    <a href="${utm(cardHref(m.card))}" style="color:#fff;font-weight:700;text-decoration:none;font-size:15px">${m.card.name}</a>
    <div style="font-size:12px;color:#6b7585;margin-top:2px">${m.card.setCode} · ${m.card.collectorNumber}</div>
    <div style="margin-top:4px;font-size:14px;color:#b8c0cc">${formatMoney(m.nowCents, currency)}
      &nbsp;<span style="color:${color};font-weight:700">${signedPct(m.pct)}</span>
      &nbsp;&nbsp;<a href="${ebayTagged}" style="color:#0079e6;font-weight:700;font-size:12px;text-decoration:none">Buy on eBay →</a></div>
  </td></tr>`;
}

function section(title: string, items: Mover[], currency: string, take: number, market: Country): string {
  if (!items.length) return "";
  return `<tr><td style="padding:14px 32px 0;font-size:13px;font-weight:700;color:#34d17e">${title}</td></tr>
    <tr><td style="padding:0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items
      .slice(0, take)
      .map((m) => moverRow(m, currency, market))
      .join("")}</table></td></tr>`;
}

interface Digest {
  subject: string;
  heading: string;
  inner: string;
}

// Build one market's digest, or null on a quiet week (house rule: skip rather
// than send noise).
function buildDigest(movers: PriceMovers, market: Country, latestReport: { slug: string; title: string } | null): Digest | null {
  if (!movers.spiking.length && !movers.plummeting.length && !movers.value.length) return null;

  const info = COUNTRIES[market];
  const currency = currencyOf(market);
  const bits: string[] = [];
  const topRiser = movers.spiking[0];
  const topDrop = movers.plummeting[0];
  if (topRiser) bits.push(`${topRiser.card.name} ${signedPct(topRiser.pct)}`);
  if (topDrop) bits.push(`${topDrop.card.name} ${signedPct(topDrop.pct)}`);
  const subject = bits.length
    ? `📊 Riftbound this week: ${bits.join(", ")}`
    : "📊 Your weekly Riftbound Index summary";

  const reportRow = latestReport
    ? `<tr><td style="padding:14px 32px 0;font-size:13px;line-height:1.6;color:#8b95a5">
         Want the full picture? Read the latest Index report:
         <a href="${utm(`/blog/${latestReport.slug}`)}" style="color:#9aa4b2">${latestReport.title}</a>
       </td></tr>`
    : "";

  const inner = `
    <tr><td style="padding:8px 32px 0;font-size:14px;line-height:1.6;color:#b8c0cc">
      The week's biggest Riftbound price moves, from live lowest in-stock prices compared across ${info.adjective} stores.
    </td></tr>
    ${section("📈 Spiking this week", movers.spiking, currency, 5, market)}
    ${section("📉 Biggest drops", movers.plummeting, currency, 5, market)}
    ${section("💎 Best value vs recent high", movers.value, currency, 3, market)}
    ${reportRow}
    <tr><td style="padding:18px 32px 24px"><a href="${utm("/movers")}" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">See all movers + price charts</a></td></tr>`;

  return { subject, heading: "This week on the Riftbound market", inner };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Weekly digest send. Walks every subscriber who hasn't received this week's
// edition, builds one digest per market (subscribers chose their market at
// signup), and emails them with a per-subscriber unsubscribe link. Marks each
// row only after a successful send, so a crash mid-run resumes cleanly.
export async function runNewsletterDigest(): Promise<NewsletterRunSummary> {
  const edition = editionKey();
  const subs = await prisma.newsletterSubscriber.findMany({ orderBy: { createdAt: "asc" } });
  const due = subs.filter((s) => s.lastEditionKey !== edition);
  const summary: NewsletterRunSummary = {
    edition,
    subscribers: subs.length,
    due: due.length,
    emails: 0,
    quietMarkets: [],
  };
  if (!due.length || !isEmailEnabled()) return summary;

  const latestReport = await prisma.marketReport.findFirst({
    orderBy: { day: "desc" },
    select: { slug: true, title: true },
  });

  // One digest per market, computed once and reused for every subscriber in it.
  const digests = new Map<Country, Digest | null>();
  for (const sub of due) {
    const market = normalizeCountry(sub.market);
    if (!digests.has(market)) {
      const movers = await getPriceMovers(market, 8);
      digests.set(market, buildDigest(movers, market, latestReport));
      if (!digests.get(market)) summary.quietMarkets.push(market);
    }
    const digest = digests.get(market);
    if (!digest) continue; // quiet week in this market — try again next edition

    // Lazy-backfill the unsubscribe token for rows created before it existed.
    const token = sub.unsubToken ?? randomUUID();
    if (!sub.unsubToken) {
      await prisma.newsletterSubscriber.update({ where: { id: sub.id }, data: { unsubToken: token } });
    }
    const unsubUrl = `${SITE_URL}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
    const sent = await sendNewsletterDigestEmail(sub.email, digest.subject, digest.heading, digest.inner, unsubUrl);
    if (sent) {
      summary.emails++;
      await prisma.newsletterSubscriber.update({ where: { id: sub.id }, data: { lastEditionKey: edition } });
    }
    await sleep(600); // stay under Resend's 2 req/s rate limit
  }
  return summary;
}
