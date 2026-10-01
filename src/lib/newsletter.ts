import { randomUUID } from "crypto";
import { prisma } from "./db";
import { getPriceMovers, type Mover, type PriceMovers } from "./price-history";
import { sendNewsletterDigestEmail, isEmailEnabled } from "./email";
import { formatMoney } from "./format";
import { currencyOf, normalizeCountry, COUNTRIES, type Country } from "./country";
import { cardHref } from "./card-url";
import { SITE_URL } from "./site";
import { ebaySearchUrl } from "./affiliate";
import { isBeforeRadianceRelease } from "./sets/radiance";
import { getMarketIndex } from "./market-index";
import { getHomeStats } from "./home-stats";
import { getAllTimeRecords } from "./market-records";
import { getPopularCards } from "./cheapest-cards";
import { getArticles } from "./articles";
import { RELEASES } from "./release-calendar";
import { pickPrice } from "./country";
import { sponsorFor, type NewsletterSponsor } from "./newsletter-sponsor";
import type { CardTileData } from "@/components/CardTile";

/** A newly imported card for the digest's "new reveals" section. */
export interface RevealRow {
  id: string;
  slug: string | null;
  name: string;
  setCode: string;
  collectorNumber: string;
}

// "New Radiance reveals this week" (2026-09-24 growth pass). The article CTAs
// now say "Get Radiance spoilers + price moves by email" until release day, and
// this is what makes that sentence true: the weekly digest lists every Radiance
// card our database imported in the last 7 days — official reveals only, the
// same rows the spoiler tracker's gallery shows — and links the tracker.
// Switches itself off on release day (isBeforeRadianceRelease).
function revealsSection(reveals: RevealRow[]): string {
  if (!reveals.length) return "";
  return `<tr><td style="padding:14px 32px 0;font-size:13px;font-weight:700;color:#34d17e">✨ New Radiance reveals this week</td></tr>
    <tr><td style="padding:0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${reveals
      .map(
        (c) => `<tr><td style="padding:8px 0;border-bottom:1px solid #233047">
      <a href="${utm(cardHref(c))}" style="color:#fff;font-weight:700;text-decoration:none;font-size:15px">${c.name}</a>
      <div style="font-size:12px;color:#6b7585;margin-top:2px">${c.setCode} · ${c.collectorNumber}</div></td></tr>`,
      )
      .join("")}</table></td></tr>
    <tr><td style="padding:8px 32px 0;font-size:13px"><a href="${utm("/blog/riftbound-radiance-spoilers")}" style="color:#34d17e;font-weight:700;text-decoration:none">Every Radiance card revealed so far →</a></td></tr>`;
}

/** Radiance cards imported in the last 7 days, while the set is unreleased. */
export async function recentRadianceReveals(now = new Date()): Promise<RevealRow[]> {
  if (!isBeforeRadianceRelease(now)) return [];
  return prisma.card
    .findMany({
      where: { setCode: "RAD", isPromo: false, createdAt: { gte: new Date(now.getTime() - 7 * 86400_000) } },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, slug: true, name: true, setCode: true, collectorNumber: true },
    })
    .catch(() => []);
}

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
  const ebayHref = ebaySearchUrl(market, `${m.card.name} Riftbound`, "newsletter");
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
  return `${heading(title)}
    <tr><td style="padding:0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items
      .slice(0, take)
      .map((m) => moverRow(m, currency, market))
      .join("")}</table></td></tr>`;
}

const esc = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function heading(title: string): string {
  return `<tr><td style="padding:18px 32px 0;font-size:13px;font-weight:700;color:#34d17e">${title}</td></tr>`;
}

function para(html: string): string {
  return `<tr><td style="padding:6px 32px 0;font-size:14px;line-height:1.6;color:#b8c0cc">${html}</td></tr>`;
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtDay = (iso: string) => DATE.format(new Date(`${iso}T00:00:00Z`));

// ── Extra sections (2026-10-01 uplift) ──────────────────────────────────────
// Every figure comes from a loader the site already shows, so the email can
// never say something the site doesn't.

export interface DigestExtras {
  /** RiftCompare Index level and its 7/30-day change for this market. */
  index?: { latest: number; d7: number | null; d30: number | null } | null;
  /** Cards with a live price and stores with stock in this market. */
  stats?: { priced: number; liveStores: number | null } | null;
  /** The market's most valuable cards (all-time peak board). */
  peaks?: { card: CardTileData; nowCents: number; peakCents: number; peakDay: string | null }[];
  /** Most-searched cards on the site right now. */
  popular?: CardTileData[];
  /** Articles published in the last 7 days (or the latest few if none). */
  articles?: { title: string; excerpt: string; href: string; date: string; fresh: boolean }[];
  /** Upcoming dated releases. */
  releases?: { name: string; date: string; daysAway: number; href: string | null }[];
  /** Sponsored slot: a booking, "house" for the sponsor-us line, or omitted for none. */
  sponsor?: NewsletterSponsor | "house" | null;
}

function glanceSection(x: DigestExtras, currency: string, market: Country): string {
  const bits: string[] = [];
  if (x.index) {
    const ch = (v: number | null, label: string) =>
      v == null ? "" : ` <span style="color:${v >= 0 ? "#f08c4a" : "#34d17e"};font-weight:700">${signedPct(v)}</span> ${label}`;
    bits.push(
      `<a href="${utm("/market")}" style="color:#fff;font-weight:700;text-decoration:none">RiftCompare Index</a>: <strong style="color:#fff">${x.index.latest.toFixed(1)}</strong>${ch(x.index.d7, "this week")}${x.index.d30 != null ? "," : ""}${ch(x.index.d30, "over 30 days")}`,
    );
  }
  if (x.stats) {
    bits.push(
      `${x.stats.priced.toLocaleString("en-US")} cards with a live price${x.stats.liveStores ? ` across ${x.stats.liveStores} ${COUNTRIES[market].adjective} stores with stock` : ""}`,
    );
  }
  if (!bits.length) return "";
  void currency;
  return `${heading("🧭 The market at a glance")}${bits.map((b) => para(b)).join("")}`;
}

function sponsorSection(sp: DigestExtras["sponsor"]): string {
  if (!sp) return "";
  if (sp === "house") {
    return `<tr><td style="padding:18px 32px 0"><div style="border:1px dashed #2b3a52;border-radius:10px;padding:12px 14px;font-size:13px;color:#8b95a5">
      <span style="font-size:10px;font-weight:700;letter-spacing:.06em;color:#6b7585">SPONSORED</span><br/>
      Want to reach Riftbound collectors every week? <a href="${utm("/contact")}" style="color:#34d17e;font-weight:700;text-decoration:none">Sponsor this newsletter →</a>
    </div></td></tr>`;
  }
  const sep = sp.url.includes("?") ? "&" : "?";
  const href = `${sp.url}${sep}utm_source=riftcompare&utm_medium=email&utm_campaign=newsletter-sponsor`;
  return `<tr><td style="padding:18px 32px 0"><div style="border:1px solid #2b3a52;background:#111a28;border-radius:10px;padding:14px 16px">
    <div style="font-size:10px;font-weight:700;letter-spacing:.06em;color:#6b7585">SPONSORED · ${esc(sp.name)}</div>
    ${sp.imageUrl ? `<a href="${esc(href)}" rel="sponsored"><img src="${esc(sp.imageUrl)}" alt="${esc(sp.name)}" width="536" style="display:block;width:100%;max-width:536px;border-radius:8px;margin-top:8px" /></a>` : ""}
    <div style="margin-top:8px;font-size:16px;font-weight:700;color:#fff">${esc(sp.headline)}</div>
    <div style="margin-top:4px;font-size:14px;line-height:1.6;color:#b8c0cc">${esc(sp.body)}</div>
    <a href="${esc(href)}" rel="sponsored" style="display:inline-block;margin-top:10px;color:#34d17e;font-weight:700;text-decoration:none">${esc(sp.cta)} →</a>
  </div></td></tr>`;
}

function peaksSection(rows: NonNullable<DigestExtras["peaks"]>, currency: string): string {
  if (!rows.length) return "";
  return `${heading("🏆 Most valuable cards right now")}
    <tr><td style="padding:0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows
      .map(
        (r) => `<tr><td style="padding:8px 0;border-bottom:1px solid #233047">
      <a href="${utm(cardHref(r.card))}" style="color:#fff;font-weight:700;text-decoration:none;font-size:15px">${esc(r.card.name)}</a>
      <div style="font-size:12px;color:#6b7585;margin-top:2px">${r.card.setCode} · ${r.card.collectorNumber}</div>
      <div style="margin-top:4px;font-size:14px;color:#b8c0cc">${formatMoney(r.nowCents, currency)} now · peak ${formatMoney(r.peakCents, currency)}${r.peakDay ? ` on ${fmtDay(r.peakDay)}` : ""}</div>
    </td></tr>`,
      )
      .join("")}</table></td></tr>
    ${para(`<a href="${utm("/market/records")}" style="color:#34d17e;font-weight:700;text-decoration:none">All-time price records →</a>`)}`;
}

function popularSection(cards: CardTileData[], currency: string, market: Country): string {
  if (!cards.length) return "";
  return `${heading("🔎 What collectors are searching for")}
    <tr><td style="padding:0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cards
      .map((c) => {
        const cents = pickPrice(c, market);
        return `<tr><td style="padding:8px 0;border-bottom:1px solid #233047">
      <a href="${utm(cardHref(c))}" style="color:#fff;font-weight:700;text-decoration:none;font-size:15px">${esc(c.name)}</a>
      <span style="font-size:12px;color:#6b7585"> · ${c.setCode}</span>
      ${cents != null ? `<span style="float:right;font-size:14px;color:#b8c0cc">from ${formatMoney(cents, currency)}</span>` : ""}
    </td></tr>`;
      })
      .join("")}</table></td></tr>`;
}

function articlesSection(list: NonNullable<DigestExtras["articles"]>): string {
  if (!list.length) return "";
  const title = list.some((a) => a.fresh) ? "📰 New on the blog this week" : "📰 Recent guides & news";
  return `${heading(title)}${list
    .map((a) =>
      para(
        `<a href="${utm(a.href)}" style="color:#fff;font-weight:700;text-decoration:none">${esc(a.title)}</a><br/><span style="font-size:13px;color:#8b95a5">${fmtDay(a.date)} · ${esc(a.excerpt)}</span>`,
      ),
    )
    .join("")}`;
}

function releasesSection(list: NonNullable<DigestExtras["releases"]>): string {
  if (!list.length) return "";
  return `${heading("📅 Coming up")}${list
    .map((r) =>
      para(
        `<strong style="color:#fff">${esc(r.name)}</strong> — ${fmtDay(r.date)} (${r.daysAway === 0 ? "today" : `in ${r.daysAway} ${r.daysAway === 1 ? "day" : "days"}`})${r.href ? ` · <a href="${utm(r.href)}" style="color:#34d17e;text-decoration:none">details →</a>` : ""}`,
      ),
    )
    .join("")}`;
}

/** Load every extra section for one market. Each source fails on its own. */
export async function loadDigestExtras(market: Country, now = new Date(), opts: { sponsor?: boolean } = {}): Promise<DigestExtras> {
  const quiet = <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);
  const [index, stats, records, popular] = await Promise.all([
    quiet(getMarketIndex(market)),
    quiet(getHomeStats()),
    quiet(getAllTimeRecords(market, 5)),
    quiet(getPopularCards(5, market)),
  ]);
  const weekAgo = new Date(now.getTime() - 7 * 86400_000).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const all = getArticles();
  const fresh = all.filter((a) => a.date >= weekAgo && a.date <= today);
  const pick = (fresh.length ? fresh : all).slice(0, 4);
  const releases = RELEASES.filter((r) => r.date && r.date >= today)
    .slice(0, 2)
    .map((r) => ({
      name: r.name,
      date: r.date!,
      daysAway: Math.round((Date.parse(`${r.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400_000),
      href: r.spoilersHref ?? null,
    }));
  return {
    index: index && typeof index.latest === "number" ? { latest: index.latest, d7: index.d7, d30: index.d30 } : null,
    stats: stats ? { priced: stats.statsByCountry[market]?.priced ?? 0, liveStores: stats.liveStoresByCountry?.[market] ?? null } : null,
    peaks: (records?.peaks ?? []).slice(0, 5).map((r) => ({ card: r.card, nowCents: r.nowCents, peakCents: r.peakCents, peakDay: r.peakDay })),
    popular: popular ?? [],
    articles: pick.map((a) => ({
      title: a.title,
      excerpt: a.excerpt.length > 140 ? `${a.excerpt.slice(0, 137)}…` : a.excerpt,
      href: `/${a.category === "guide" ? "guides" : "blog"}/${a.slug}`,
      date: a.date,
      fresh: fresh.length > 0,
    })),
    releases,
    ...(opts.sponsor ? { sponsor: sponsorFor(market, now) ?? "house" } : {}),
  };
}

// Exported so lib/user-digest.ts (the weekly send to registered accounts) can
// build and reuse the exact same content instead of duplicating it.
export interface Digest {
  subject: string;
  heading: string;
  inner: string;
}

// Build one market's digest, or null on a quiet week (house rule: skip rather
// than send noise).
// No `latestReport` parameter anymore: the market-report feature is deleted, so
// the "read the latest Index report" row was linking a
// permanently-ageing legacy row — i.e. mailing subscribers a months-old,
// noindexed page as though it were this week's. The digest now points at /movers
// (live, always current) instead.
export function buildDigest(movers: PriceMovers, market: Country, reveals: RevealRow[] = [], extras: DigestExtras = {}): Digest | null {
  const quietMarket = !movers.spiking.length && !movers.plummeting.length && !movers.value.length;
  if (quietMarket && !reveals.length) return null;

  const info = COUNTRIES[market];
  const currency = currencyOf(market);
  const bits: string[] = [];
  const topRiser = movers.spiking[0];
  const topDrop = movers.plummeting[0];
  if (topRiser) bits.push(`${topRiser.card.name} ${signedPct(topRiser.pct)}`);
  if (topDrop) bits.push(`${topDrop.card.name} ${signedPct(topDrop.pct)}`);
  const subject = bits.length
    ? `📊 Riftbound this week: ${bits.join(", ")}`
    : reveals.length
      ? `✨ ${reveals.length} new Radiance ${reveals.length === 1 ? "reveal" : "reveals"} this week`
      : "📊 Your weekly Riftbound Index summary";

  const inner = `
    <tr><td style="padding:8px 32px 0;font-size:14px;line-height:1.6;color:#b8c0cc">
      Your weekly read on the Riftbound market: the biggest price moves, the most valuable cards, what collectors are searching for and what's coming up — from live lowest in-stock prices compared across ${info.adjective} stores.
    </td></tr>
    ${glanceSection(extras, currency, market)}
    ${revealsSection(reveals)}
    ${section("📈 Spiking this week", movers.spiking, currency, 8, market)}
    ${sponsorSection(extras.sponsor)}
    ${section("📉 Biggest drops", movers.plummeting, currency, 8, market)}
    ${section("💎 Best value vs recent high", movers.value, currency, 5, market)}
    ${extras.peaks ? peaksSection(extras.peaks, currency) : ""}
    ${extras.popular ? popularSection(extras.popular, currency, market) : ""}
    ${extras.articles ? articlesSection(extras.articles) : ""}
    ${extras.releases ? releasesSection(extras.releases) : ""}
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

  // One digest per market, computed once and reused for every subscriber in it.
  const digests = new Map<Country, Digest | null>();
  const reveals = await recentRadianceReveals();
  for (const sub of due) {
    const market = normalizeCountry(sub.market);
    if (!digests.has(market)) {
      const movers = await getPriceMovers(market, 8);
      const extras = await loadDigestExtras(market, new Date(), { sponsor: true });
      digests.set(market, buildDigest(movers, market, reveals, extras));
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
