// THE WEEKLY "BIGGEST DROPS" EMAIL for the sister sites (2026-11-08, owner:
// "implement all of this", the competitor scan's gap #5; DECISIONS.md "A weekly
// biggest-drops email for the sister sites").
//
//   • Opt-in only: an UNTICKED box on the sites' alert form, or a button on the
//     manage page. It rides the address's double opt-in; an unconfirmed address
//     gets nothing but its one confirmation email. No pop-up anywhere.
//   • Once a week per site, only while the site has a subscriber, the daily run
//     reads the site's /alert-feed.json and compares each product's lowest
//     in-stock store price with the one stored a week earlier (the edition). The
//     drops it keeps are real store prices from the site's own feed: never eBay,
//     Amazon or a conversion, and the email links only to the site's own pages
//     (no eBay link in email: EPN messaging approval is not granted).
//   • Each subscriber gets each edition once, while it is fresh, inside the
//     service's daily mail cap MINUS a reserve kept for confirmations and alerts.
//   • A region with fewer than MIN_DROPS drops sends nothing that week.
import type { Prisma as PrismaNS } from "@prisma/client";
import type { prisma as Prisma } from "../db";
import { escapeHtml, getLastEmailError } from "../email";
import { sendSisterMail } from "./send";
import { fetchFeed as realFetchFeed, feedIsFresh, type AlertFeed } from "./feed";
import { button, fromFor, money, REGION_LABEL, serviceUrl, shell, siteLink, type BuiltMail } from "./email";
import { SISTER_ALERT_SITES, SISTER_REGIONS, sisterSite, type SisterAlertSite, type SisterRegion } from "./sites";
import { claimMailSlot, SISTER_DAILY_MAIL_CAP } from "./mail-cap";

/** An edition is rebuilt this long after the last one (a little under a week: the cron runs at a fixed hour). */
export const EDITION_EVERY_MS = 7 * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000;
/** An edition not yet sent to someone this long after it was built waits for the next one. */
export const EDITION_SEND_WINDOW_MS = 4 * 24 * 60 * 60 * 1000;
/** Products under this (in their region's cents) are not stored: a drop on them is never news. */
export const MIN_PRICE_CENTS = 500;
/** A drop must be at least this share of last week's price… */
export const MIN_DROP_PCT = 8;
/** …and at least this many cents… */
export const MIN_DROP_CENTS = 300;
/** …and at most this share: a bigger "drop" is more likely a wrong match or a mispriced listing than a deal. */
export const MAX_DROP_PCT = 60;
export const MAX_DROPS = 10;
export const MIN_DROPS = 3;
/** Digests may claim a send only while the day's counter is at or under this, so confirmations and alerts keep the rest. */
export const DIGEST_MAIL_CEILING = SISTER_DAILY_MAIL_CAP - 10;

export type PriceSnapshot = Record<string, Partial<Record<SisterRegion, number>>>;
export interface Drop {
  id: string;
  n: string;
  u: string;
  was: number;
  now: number;
}
export type DropsByRegion = Partial<Record<SisterRegion, Drop[]>>;

const REGIONS = new Set<string>(SISTER_REGIONS);
const isCents = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x > 0 && x < 1e9;

/** The prices worth keeping for next week's comparison: every region price of 5.00 or more. */
export function snapshotOf(feed: Pick<AlertFeed, "items">): PriceSnapshot {
  const out: PriceSnapshot = {};
  for (const [id, it] of Object.entries(feed.items)) {
    const p: Partial<Record<SisterRegion, number>> = {};
    let any = false;
    for (const r of SISTER_REGIONS) {
      const c = it.p[r];
      if (c != null && c >= MIN_PRICE_CENTS) {
        p[r] = c;
        any = true;
      }
    }
    if (any) out[id] = p;
  }
  return out;
}

/** Reads a stored snapshot back, dropping anything malformed (the column is Json). */
export function readSnapshot(raw: unknown): PriceSnapshot {
  const out: PriceSnapshot = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const p: Partial<Record<SisterRegion, number>> = {};
    for (const [r, c] of Object.entries(v as Record<string, unknown>)) if (REGIONS.has(r) && isCents(c)) p[r as SisterRegion] = c;
    out[id] = p;
  }
  return out;
}

export function readDrops(raw: unknown): DropsByRegion {
  const out: DropsByRegion = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [r, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!REGIONS.has(r) || !Array.isArray(list)) continue;
    const ok = list.filter(
      (d): d is Drop => !!d && typeof d === "object" && typeof d.id === "string" && typeof d.n === "string" && typeof d.u === "string" && isCents(d.was) && isCents(d.now) && d.now < d.was,
    );
    out[r as SisterRegion] = ok.slice(0, MAX_DROPS);
  }
  return out;
}

/**
 * This week's biggest drops per region: a product priced in both weeks whose
 * lowest in-stock store price fell by MIN_DROP_PCT–MAX_DROP_PCT and at least
 * MIN_DROP_CENTS, biggest share first (then the bigger saving), at most MAX_DROPS.
 */
export function computeDrops(previous: PriceSnapshot, feed: Pick<AlertFeed, "items">): DropsByRegion {
  const out: DropsByRegion = {};
  for (const region of SISTER_REGIONS) {
    const list: (Drop & { pct: number })[] = [];
    for (const [id, it] of Object.entries(feed.items)) {
      const was = previous[id]?.[region];
      const now = it.p[region];
      if (was == null || now == null || now >= was) continue;
      const saved = was - now;
      const pct = (saved / was) * 100;
      if (pct < MIN_DROP_PCT || pct > MAX_DROP_PCT || saved < MIN_DROP_CENTS) continue;
      list.push({ id, n: it.n, u: it.u, was, now, pct });
    }
    list.sort((a, b) => b.pct - a.pct || b.was - b.now - (a.was - a.now) || a.id.localeCompare(b.id));
    if (list.length) out[region] = list.slice(0, MAX_DROPS).map(({ pct: _pct, ...d }) => d);
  }
  return out;
}

export const editionId = (now: Date) => now.toISOString().slice(0, 10);

export function editionDue(builtAt: Date | null, now: Date): boolean {
  return !builtAt || now.getTime() - builtAt.getTime() >= EDITION_EVERY_MS;
}

const pctOff = (d: Drop) => Math.round(((d.was - d.now) / d.was) * 100);

/** One subscriber's weekly email: the site's biggest drops in their region, each linking to the site's own page. */
export function buildDigestEmail(siteKey: string, region: SisterRegion, drops: Drop[], token: string): BuiltMail {
  const site = sisterSite(siteKey)!;
  const rows = drops.slice(0, MAX_DROPS);
  const top = rows[0]!;
  const subject = `This week's biggest price drops on ${site.name}: ${top.n} −${pctOff(top)}%`;
  const items = rows
    .map((d) => {
      const link = siteLink(site, d.u, "weekly-drops", region);
      return `<tr><td style="padding:8px 28px 2px">
        <div style="border:1px solid #e5e7eb;border-radius:10px;padding:11px 14px">
          <a href="${escapeHtml(link)}" style="font-size:15px;font-weight:700;color:#111827;text-decoration:none">${escapeHtml(d.n)}</a>
          <div style="margin-top:4px;font-size:14px;color:#374151"><strong style="color:#047857">${escapeHtml(money(d.now, region))}</strong> <span style="color:#6b7280;text-decoration:line-through">${escapeHtml(money(d.was, region))}</span> · down ${pctOff(d)}% this week</div>
        </div></td></tr>`;
    })
    .join("");
  const cta = `<tr><td style="padding:14px 28px 6px">${button(site, siteLink(site, "/", "weekly-drops", region), `Compare prices on ${site.name}`)}</td></tr>`;
  const note = `<tr><td style="padding:10px 28px 16px;font-size:12px;line-height:1.6;color:#6b7280">Each price is the lowest in-stock price at ${REGION_LABEL[region]} stores we compare, this week against last week, before postage. Stores change prices quickly, so check before you buy.</td></tr>`;
  const stop = `${serviceUrl("manage", token)}&stop=${encodeURIComponent(`digest:${site.key}`)}`;
  const footer = `<tr><td style="padding:14px 28px 22px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.6;color:#6b7280">You're getting this because you asked ${escapeHtml(site.name)} for its weekly biggest price drops. <a href="${escapeHtml(stop)}" style="color:#4b5563">Stop the weekly email</a> · <a href="${escapeHtml(serviceUrl("manage", token))}" style="color:#4b5563">Manage your emails</a><br/>Sent by our sister site RiftCompare's alert service (riftcompare.com).</td></tr>`;
  const text = [
    subject,
    "",
    ...rows.map((d) => `${d.n}: ${money(d.now, region)} (was ${money(d.was, region)}, down ${pctOff(d)}%)\n${siteLink(site, d.u, "weekly-drops", region)}`),
    "",
    `Lowest in-stock price at ${REGION_LABEL[region]} stores, this week against last week, before postage.`,
    `Stop the weekly email: ${stop}`,
  ].join("\n");
  const heading = `${rows.length} biggest price drops this week`;
  return { subject, html: shell(site, heading, items + cta + note, footer, `${top.n}: ${money(top.now, region)}, down ${pctOff(top)}%`), text };
}

/** RFC 8058 one-click unsubscribe for the weekly email: stops that site's digest only. */
export function digestUnsubscribeHeaders(token: string, siteKey: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${serviceUrl("unsubscribe", token)}&digest=${encodeURIComponent(siteKey)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

type Db = typeof Prisma;

export interface DigestDeps {
  db: Db;
  now?: Date;
  fetchFeed?: (site: SisterAlertSite) => Promise<AlertFeed>;
  send?: (to: string, subject: string, html: string, extras: { text: string; headers: Record<string, string>; from: string }, siteKey?: string) => Promise<boolean>;
  dryRun?: boolean;
}

export interface DigestSummary {
  subscribers: number;
  sites: Record<string, { subscribers: number; edition: "built" | "first" | "current" | "error" | "unused"; drops?: number; error?: string }>;
  emailed: number;
  skippedFewDrops: number;
  deferred: number;
  failed: number;
  lastError?: string | null;
}

export async function runSisterDigest(deps: DigestDeps): Promise<DigestSummary> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const fetchFeed = deps.fetchFeed ?? ((s: SisterAlertSite) => realFetchFeed(s));
  const send = deps.send ?? ((to, subject, html, extras, siteKey) => sendSisterMail(siteKey, to, subject, html, extras));
  const dryRun = !!deps.dryRun;
  const summary: DigestSummary = { subscribers: 0, sites: {}, emailed: 0, skippedFewDrops: 0, deferred: 0, failed: 0 };

  // 1. Who wants it (bounded, only the columns used). Confirmed addresses only.
  const subs = await db.sisterDigest.findMany({ select: { email: true, site: true, region: true, lastEdition: true }, orderBy: { lastSentAt: { sort: "asc", nulls: "first" } }, take: 20000 });
  const confirmed = subs.length
    ? await db.sisterAlertAddress.findMany({ where: { email: { in: [...new Set(subs.map((s) => s.email))] }, confirmedAt: { not: null } }, select: { email: true, token: true } })
    : [];
  const tokenOf = new Map(confirmed.map((a) => [a.email, a.token]));
  const live = subs.filter((s) => tokenOf.has(s.email) && sisterSite(s.site));
  summary.subscribers = live.length;

  // 2. Editions: the daily read is builtAt only; the prices blob only when one is due.
  const editions = await db.sisterDigestEdition.findMany({ select: { site: true, edition: true, builtAt: true } });
  const edOf = new Map(editions.map((e) => [e.site, e]));
  const wanted = new Set(subs.filter((s) => sisterSite(s.site)).map((s) => s.site)); // unconfirmed too: the baseline is ready when they confirm
  for (const site of SISTER_ALERT_SITES) {
    const count = live.filter((s) => s.site === site.key).length;
    if (!wanted.has(site.key)) {
      summary.sites[site.key] = { subscribers: 0, edition: "unused" };
      continue;
    }
    const ed = edOf.get(site.key);
    if (!editionDue(ed?.builtAt ?? null, now)) {
      summary.sites[site.key] = { subscribers: count, edition: "current" };
      continue;
    }
    try {
      const feed = await fetchFeed(site);
      if (!feedIsFresh(feed, now)) throw new Error(`feed generated ${feed.generatedAt}`);
      const prev = ed ? readSnapshot((await db.sisterDigestEdition.findUnique({ where: { site: site.key }, select: { prices: true } }))?.prices) : null;
      const drops = prev ? computeDrops(prev, feed) : {};
      const row = { edition: editionId(now), builtAt: now, prices: snapshotOf(feed) as PrismaNS.InputJsonObject, drops: drops as PrismaNS.InputJsonObject };
      if (!dryRun) await db.sisterDigestEdition.upsert({ where: { site: site.key }, create: { site: site.key, ...row }, update: row });
      edOf.set(site.key, { site: site.key, edition: row.edition, builtAt: now });
      summary.sites[site.key] = { subscribers: count, edition: prev ? "built" : "first", drops: Object.values(drops).reduce((n, l) => n + (l?.length ?? 0), 0) };
    } catch (e) {
      summary.sites[site.key] = { subscribers: count, edition: "error", error: e instanceof Error ? e.message : String(e) };
    }
  }

  // 3. Send each fresh edition once per subscriber, inside the digest's share of the daily cap.
  const dropsCache = new Map<string, DropsByRegion>();
  let capped = false;
  for (const s of live) {
    const ed = edOf.get(s.site);
    if (!ed || s.lastEdition === ed.edition || now.getTime() - ed.builtAt.getTime() > EDITION_SEND_WINDOW_MS) continue;
    if (!dropsCache.has(s.site)) {
      const row = await db.sisterDigestEdition.findUnique({ where: { site: s.site }, select: { drops: true } });
      dropsCache.set(s.site, readDrops(row?.drops));
    }
    const drops = dropsCache.get(s.site)![s.region as SisterRegion] ?? [];
    if (drops.length < MIN_DROPS) {
      summary.skippedFewDrops += 1;
      continue;
    }
    if (capped) {
      summary.deferred += 1;
      continue;
    }
    if (dryRun) {
      summary.emailed += 1;
      continue;
    }
    if (!(await claimMailSlot(db, now, DIGEST_MAIL_CEILING))) {
      capped = true; // stop claiming: every refused claim still spends a slot of the day
      summary.deferred += 1;
      continue;
    }
    const site = sisterSite(s.site)!;
    const token = tokenOf.get(s.email)!;
    const mail = buildDigestEmail(site.key, s.region as SisterRegion, drops, token);
    const ok = await send(s.email, mail.subject, mail.html, { text: mail.text, headers: digestUnsubscribeHeaders(token, site.key), from: fromFor(site) }, site.key);
    if (ok) {
      summary.emailed += 1;
      await db.sisterDigest.update({ where: { email_site: { email: s.email, site: s.site } }, data: { lastEdition: ed.edition, lastSentAt: now } });
    } else {
      summary.failed += 1;
      summary.lastError = getLastEmailError();
    }
  }
  return summary;
}

/** True when a site with confirmed subscribers could not build its due edition. */
export function digestHasSiteFailure(s: DigestSummary): boolean {
  return Object.values(s.sites).some((x) => x.subscribers > 0 && x.edition === "error");
}
