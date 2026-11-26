// THE SEALED STASH TRACKER (2026-11-26, owner: "get these implemented ASAP", move 5 of the deal-site study; DECISIONS.md,
// "A signed-in member's collection follows them, and a weekly stash email").
//
// A sister site's /collection list used to live in one browser only. A signed-in member's list now also lives here, so it
// follows them to another device and can be valued once a week in an email they asked for:
//
//   • The list is the member's own (token from lib/sister-premium.ts names the address and the site). Optimistic
//     concurrency: every write names the revision it was built on (`baseRev`); a stale write is refused with the current
//     list, and the browser merges and tries again. Nothing is ever lost to a race between two devices.
//   • The weekly email is OPT-IN (an unticked switch on /collection), to the account's own address only, which signing in
//     already proved. It is valued from the site's own /alert-feed.json (lowest in-stock store price per region, never eBay,
//     Amazon or a conversion), and every name and link in it comes from that feed, never from what the browser stored.
//   • It runs in the daily sister-alerts call, after the alerts and the biggest-drops email, inside the same digest share of
//     the shared mail cap, so a busy day defers it to the next day; it never spends the alerts' reserve.
//   • An empty week (nothing in the list has a store price today) sends nothing.
//
// Pure apart from runStashDigest, which takes its database, feed and mailer as arguments (tests/sister-stash.test.ts).
import type { Prisma as PrismaNS } from "@prisma/client";
import type { prisma as Prisma } from "./db";
import { escapeHtml, getLastEmailError } from "./email";
import { sendSisterMail } from "./sister-alerts/send";
import { fetchFeed as realFetchFeed, feedIsFresh, type AlertFeed } from "./sister-alerts/feed";
import { button, feedbackAsk, fromFor, money, REGION_LABEL, serviceUrl, shell, senderOf, siteLink, type BuiltMail } from "./sister-alerts/email";
import { SISTER_REGIONS, sisterSite, type SisterAlertSite, type SisterRegion } from "./sister-alerts/sites";
import { claimMailSlot, mailLane } from "./sister-alerts/mail-cap";
import { DIGEST_MAIL_CEILING } from "./sister-alerts/digest";

/** Sites whose /collection syncs here and may send the weekly stash email. Each must also be a sister alert site (its feed). */
export const STASH_SITES = new Set<string>(["tcgprices"]);

export const STASH_MAX_ITEMS = 300;
export const STASH_MAX_QTY = 99;
/** A week, less two hours: the cron runs at a fixed hour, so an exact week would drift a day late. */
export const STASH_EVERY_MS = 7 * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000;
export const STASH_MOVERS = 3;

/** One item as stored. Display fields (n, h, img) are for the member's own browser only and never reach an email. */
export interface StashItem {
  /** the product's id in the site's feed */
  id: string;
  /** market it is valued in (US, AU…) */
  m: SisterRegion;
  q: number;
  /** price per unit when added, in the market's cents (0 = unknown) */
  a: number;
  /** when added, ISO */
  at: string;
  n?: string;
  h?: string;
  img?: string;
}

const REGIONS = new Set<string>(SISTER_REGIONS);
const ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;
const isCents = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x > 0 && x < 1e9;
const cleanText = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max) : "");
const cleanPath = (x: unknown) => (typeof x === "string" && x.startsWith("/") && !x.startsWith("//") && x.length <= 300 && !/[\s<>"'\\]/.test(x) ? x : "");
const cleanImage = (x: unknown) => (typeof x === "string" && /^https:\/\/[^\s<>"']{4,400}$/.test(x) ? x : "");

export const stashKey = (i: Pick<StashItem, "id" | "m">) => `${i.m}:${i.id}`;

/**
 * A list from the browser or the database, validated: anything malformed is dropped (never guessed), quantities are
 * clamped to 1–99, a product in one market appears once (the first wins), and at most STASH_MAX_ITEMS are kept.
 */
export function parseStashItems(raw: unknown): StashItem[] {
  if (!Array.isArray(raw)) return [];
  const out: StashItem[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (out.length >= STASH_MAX_ITEMS) break;
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    if (typeof r.id !== "string" || !ID_RE.test(r.id) || typeof r.m !== "string" || !REGIONS.has(r.m)) continue;
    const q = Math.floor(Number(r.q));
    if (!Number.isFinite(q) || q < 1) continue;
    const item: StashItem = { id: r.id, m: r.m as SisterRegion, q: Math.min(STASH_MAX_QTY, q), a: isCents(r.a) ? r.a : 0, at: typeof r.at === "string" && !Number.isNaN(Date.parse(r.at)) ? new Date(r.at).toISOString() : new Date(0).toISOString() };
    const n = cleanText(r.n, 200);
    const h = cleanPath(r.h);
    const img = cleanImage(r.img);
    if (n) item.n = n;
    if (h) item.h = h;
    if (img) item.img = img;
    const key = stashKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

// ─── Valuing a list against the site's feed ───────────────────────────────────────────────────────────────────────────

export interface StashLine {
  key: string;
  id: string;
  m: SisterRegion;
  q: number;
  /** from the feed: the email never uses the stored name or path */
  name: string;
  path: string;
  now: number | null;
  /** unit price at the last weekly email, or null (first email, or not priced then) */
  week: number | null;
  added: number | null;
}

export interface MarketSummary {
  m: SisterRegion;
  /** priced items × qty */
  now: number;
  units: number;
  unpriced: number;
  /** like for like: only items priced both now and at the last email */
  week: { from: number; to: number } | null;
  /** like for like: only items priced now and when added */
  added: { from: number; to: number } | null;
}

export type PriceMemory = Record<string, number>;

export function readPriceMemory(raw: unknown): PriceMemory {
  const out: PriceMemory = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (k.length <= 90 && isCents(v)) out[k] = v;
  return out;
}

/** Each stored item against the feed. An item the feed no longer lists keeps no name and is left out of the email. */
export function valueStash(items: StashItem[], feed: Pick<AlertFeed, "items">, memory: PriceMemory): StashLine[] {
  const lines: StashLine[] = [];
  for (const i of items) {
    const f = feed.items[i.id];
    if (!f) continue;
    const c = f.p[i.m];
    const key = stashKey(i);
    lines.push({ key, id: i.id, m: i.m, q: i.q, name: f.n, path: f.u, now: isCents(c) ? c : null, week: memory[key] ?? null, added: i.a > 0 ? i.a : null });
  }
  return lines;
}

export function summarise(lines: StashLine[]): MarketSummary[] {
  const by = new Map<SisterRegion, MarketSummary>();
  for (const l of lines) {
    const s = by.get(l.m) ?? { m: l.m, now: 0, units: 0, unpriced: 0, week: null, added: null };
    s.units += l.q;
    if (l.now == null) s.unpriced += 1;
    else {
      s.now += l.now * l.q;
      if (l.week != null) s.week = { from: (s.week?.from ?? 0) + l.week * l.q, to: (s.week?.to ?? 0) + l.now * l.q };
      if (l.added != null) s.added = { from: (s.added?.from ?? 0) + l.added * l.q, to: (s.added?.to ?? 0) + l.now * l.q };
    }
    by.set(l.m, s);
  }
  return [...by.values()].filter((s) => s.now > 0).sort((a, b) => b.now - a.now);
}

/** The change as a percentage to one decimal place, or null when there is nothing to compare. */
export function pct(ch: { from: number; to: number } | null): number | null {
  if (!ch || !(ch.from > 0)) return null;
  return Math.round(((ch.to - ch.from) / ch.from) * 1000) / 10;
}

export interface Mover {
  line: StashLine;
  /** change in value (× qty), market cents */
  delta: number;
  pct: number;
}

/** The biggest moves this week (or since added, on the first email): up to STASH_MOVERS each way, by money moved. */
export function movers(lines: StashLine[], since: "week" | "added"): { up: Mover[]; down: Mover[] } {
  const all: Mover[] = [];
  for (const l of lines) {
    const from = since === "week" ? l.week : l.added;
    if (l.now == null || from == null || l.now === from) continue;
    all.push({ line: l, delta: (l.now - from) * l.q, pct: Math.round(((l.now - from) / from) * 1000) / 10 });
  }
  const up = all.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta || a.line.key.localeCompare(b.line.key)).slice(0, STASH_MOVERS);
  const down = all.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta || a.line.key.localeCompare(b.line.key)).slice(0, STASH_MOVERS);
  return { up, down };
}

/** What to remember for next week's comparison: today's unit price of every priced item. */
export function priceMemoryOf(lines: StashLine[]): PriceMemory {
  const out: PriceMemory = {};
  for (const l of lines) if (l.now != null) out[l.key] = l.now;
  return out;
}

export function stashDue(weekly: boolean, lastSentAt: Date | null, now: Date): boolean {
  if (!weekly) return false;
  return !lastSentAt || now.getTime() - lastSentAt.getTime() >= STASH_EVERY_MS;
}

// ─── The email ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const signed = (cents: number, m: SisterRegion) => (cents > 0 ? `+${money(cents, m)}` : cents < 0 ? `−${money(-cents, m)}` : money(0, m));
const signedPct = (p: number) => (p > 0 ? `+${p}%` : p < 0 ? `−${Math.abs(p)}%` : "0%");
const GREEN = "#047857";
const RED = "#b91c1c";
const GREY = "#6b7280";
const tone = (n: number) => (n > 0 ? GREEN : n < 0 ? RED : GREY);

function changeLine(s: MarketSummary, first: boolean): { html: string; text: string; delta: number; p: number | null } {
  const ch = first ? s.added : s.week;
  const p = pct(ch);
  if (!ch || p == null) return { html: `<span style="color:${GREY}">${first ? "Your first weekly report" : "Nothing to compare with last week yet"}</span>`, text: first ? "Your first weekly report" : "", delta: 0, p: null };
  const delta = ch.to - ch.from;
  const when = first ? "since you added them" : "this week";
  return {
    html: `<strong style="color:${tone(delta)}">${escapeHtml(signed(delta, s.m))} (${signedPct(p)})</strong> <span style="color:${GREY}">${when}</span>`,
    text: `${signed(delta, s.m)} (${signedPct(p)}) ${when}`,
    delta,
    p,
  };
}

export function buildStashEmail(siteKey: string, lines: StashLine[], token: string, first: boolean): BuiltMail | null {
  const site = sisterSite(siteKey);
  if (!site) return null;
  const sums = summarise(lines);
  if (!sums.length) return null;
  const main = sums[0]!;
  const mainCh = changeLine(main, first);
  const since = first ? "added" : "week";
  const { up, down } = movers(lines.filter((l) => l.m === main.m), since);

  const subject =
    mainCh.p == null || mainCh.p === 0
      ? `Your ${site.name} collection${first ? "" : " this week"}: ${money(main.now, main.m)}`
      : `Your collection is ${mainCh.p > 0 ? "up" : "down"} ${Math.abs(mainCh.p)}% ${first ? "since you added it" : "this week"}: ${money(main.now, main.m)}`;

  const link = (path: string, m: SisterRegion) => siteLink(site, path, "weekly-stash", m.toLowerCase());
  const hero = `<tr><td style="padding:14px 28px 4px">
      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px 18px;background:#fafbfc">
        <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:${GREY}">Worth today · ${escapeHtml(REGION_LABEL[main.m])} stores</div>
        <div style="margin-top:4px;font-size:30px;line-height:1.15;font-weight:800;color:#111827">${escapeHtml(money(main.now, main.m))}</div>
        <div style="margin-top:6px;font-size:14px">${mainCh.html}</div>
        <div style="margin-top:6px;font-size:12px;color:${GREY}">${main.units} ${main.units === 1 ? "item" : "items"}${main.unpriced ? ` · ${main.unpriced} not in stock anywhere today, left out` : ""}</div>
      </div></td></tr>`;
  const others = sums
    .slice(1)
    .map((s) => {
      const c = changeLine(s, first);
      return `<tr><td style="padding:6px 28px 0;font-size:14px;color:#374151"><strong>${escapeHtml(money(s.now, s.m))}</strong> at ${escapeHtml(REGION_LABEL[s.m])} stores · ${c.html}</td></tr>`;
    })
    .join("");
  const moverRow = (mv: Mover) =>
    `<tr><td style="padding:6px 28px 0"><div style="border:1px solid #e5e7eb;border-radius:10px;padding:10px 14px">
      <a href="${escapeHtml(link(mv.line.path, mv.line.m))}" style="font-size:14px;font-weight:700;color:#111827;text-decoration:none">${escapeHtml(mv.line.name)}</a>
      <div style="margin-top:3px;font-size:13px;color:#374151">${escapeHtml(money(mv.line.now!, mv.line.m))}${mv.line.q > 1 ? ` × ${mv.line.q}` : ""} · <strong style="color:${tone(mv.delta)}">${escapeHtml(signed(mv.delta, mv.line.m))} (${signedPct(mv.pct)})</strong></div>
    </div></td></tr>`;
  const section = (title: string, list: Mover[]) => (list.length ? `<tr><td style="padding:16px 28px 2px;font-size:13px;font-weight:700;color:#111827">${title}</td></tr>${list.map(moverRow).join("")}` : "");
  const moves = section(first ? "Up most since you added them" : "Up most this week", up) + section(first ? "Down most since you added them" : "Down most this week", down);
  const quiet = !up.length && !down.length ? `<tr><td style="padding:12px 28px 0;font-size:14px;color:#374151">${first ? "Prices are where they were when you added your items." : "No item in your collection changed price this week."}</td></tr>` : "";
  const cta = `<tr><td style="padding:18px 28px 6px">${button(site, link("/collection", main.m), "Open my collection")}</td></tr>`;
  const note = `<tr><td style="padding:10px 28px 16px;font-size:12px;line-height:1.6;color:${GREY}">Each value is the lowest in-stock price at the stores ${escapeHtml(site.name)} compares in that market, before postage, times how many you own. It's what it would cost to buy again today, not what it would sell for.<br/>${feedbackAsk(site, "weekly-stash")}</td></tr>`;
  const stop = `${serviceUrl("manage", token, site)}&stop=${encodeURIComponent(`stash:${site.key}`)}`;
  const footer = `<tr><td style="padding:14px 28px 22px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.6;color:${GREY}">You're getting this because you turned on the weekly collection email on ${escapeHtml(site.name)}. <a href="${escapeHtml(stop)}" style="color:#4b5563">Stop the weekly email</a> · <a href="${escapeHtml(link("/collection", main.m))}" style="color:#4b5563">Change it on your collection page</a><br/>Sent by ${senderOf(site)}.</td></tr>`;
  const text = [
    subject,
    "",
    `Worth today at ${REGION_LABEL[main.m]} stores: ${money(main.now, main.m)}${mainCh.text ? `, ${mainCh.text}` : ""}`,
    ...sums.slice(1).map((s) => `${REGION_LABEL[s.m]} stores: ${money(s.now, s.m)}${changeLine(s, first).text ? `, ${changeLine(s, first).text}` : ""}`),
    "",
    ...[...up, ...down].map((mv) => `${mv.line.name}: ${money(mv.line.now!, mv.line.m)} (${signed(mv.delta, mv.line.m)}, ${signedPct(mv.pct)})\n${link(mv.line.path, mv.line.m)}`),
    "",
    `Open my collection: ${link("/collection", main.m)}`,
    "Lowest in-stock store price in each market, before postage, times how many you own.",
    `Stop the weekly email: ${stop}`,
  ].join("\n");
  const pre = mainCh.text ? `${money(main.now, main.m)}, ${mainCh.text}` : `${money(main.now, main.m)} at today's store prices`;
  return { subject, html: shell(site, first ? "Your collection, valued every week" : "Your collection this week", hero + others + moves + quiet + cta + note, footer, pre), text };
}

/** RFC 8058 one-click unsubscribe: stops this site's weekly stash email only (the list itself is kept). */
export function stashUnsubscribeHeaders(token: string, siteKey: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${serviceUrl("unsubscribe", token)}&stash=${encodeURIComponent(siteKey)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

// ─── The weekly run ───────────────────────────────────────────────────────────────────────────────────────────────────

type Db = typeof Prisma;

export interface StashDeps {
  db: Db;
  now?: Date;
  fetchFeed?: (site: SisterAlertSite) => Promise<AlertFeed>;
  send?: (to: string, subject: string, html: string, extras: { text: string; headers: Record<string, string>; from: string }, siteKey?: string) => Promise<boolean>;
  dryRun?: boolean;
}

export interface StashSummary {
  due: number;
  emailed: number;
  empty: number;
  deferred: number;
  failed: number;
  sites: Record<string, { due: number; feed: "ok" | "error"; error?: string }>;
  lastError?: string | null;
}

export async function runStashDigest(deps: StashDeps): Promise<StashSummary> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const fetchFeed = deps.fetchFeed ?? ((s: SisterAlertSite) => realFetchFeed(s));
  const send = deps.send ?? ((to, subject, html, extras, siteKey) => sendSisterMail(siteKey, to, subject, html, extras));
  const summary: StashSummary = { due: 0, emailed: 0, empty: 0, deferred: 0, failed: 0, sites: {} };

  // Due rows only (bounded; the oldest send first so a capped day rotates fairly). `items` is read per row below.
  const rows = await db.sisterStash.findMany({
    where: { weekly: true, site: { in: [...STASH_SITES] }, OR: [{ lastSentAt: null }, { lastSentAt: { lte: new Date(now.getTime() - STASH_EVERY_MS) } }] },
    select: { email: true, site: true, lastSentAt: true },
    orderBy: { lastSentAt: { sort: "asc", nulls: "first" } },
    take: 2000,
  });
  const due = rows.filter((r) => stashDue(true, r.lastSentAt, now) && sisterSite(r.site));
  summary.due = due.length;
  if (!due.length) return summary;

  const addresses = await db.sisterAlertAddress.findMany({ where: { email: { in: [...new Set(due.map((r) => r.email))] }, confirmedAt: { not: null } }, select: { email: true, token: true } });
  const tokenOf = new Map(addresses.map((a) => [a.email, a.token]));

  const feeds = new Map<string, AlertFeed | null>();
  for (const key of new Set(due.map((r) => r.site))) {
    const site = sisterSite(key)!;
    const count = due.filter((r) => r.site === key).length;
    try {
      const feed = await fetchFeed(site);
      if (!feedIsFresh(feed, now)) throw new Error(`feed generated ${feed.generatedAt}`);
      feeds.set(key, feed);
      summary.sites[key] = { due: count, feed: "ok" };
    } catch (e) {
      feeds.set(key, null);
      summary.sites[key] = { due: count, feed: "error", error: e instanceof Error ? e.message : String(e) };
    }
  }

  const capped = new Set<string>();
  for (const r of due) {
    const feed = feeds.get(r.site);
    const token = tokenOf.get(r.email);
    if (!feed || !token) continue;
    const row = await db.sisterStash.findUnique({ where: { email_site: { email: r.email, site: r.site } }, select: { items: true, lastPrices: true, weekly: true } });
    if (!row?.weekly) continue;
    const lines = valueStash(parseStashItems(row.items), feed, readPriceMemory(row.lastPrices));
    const mail = buildStashEmail(r.site, lines, token, !r.lastSentAt);
    if (!mail) {
      summary.empty += 1;
      continue;
    }
    if (capped.has(mailLane(r.site))) {
      summary.deferred += 1;
      continue;
    }
    if (deps.dryRun) {
      summary.emailed += 1;
      continue;
    }
    if (!(await claimMailSlot(db, now, DIGEST_MAIL_CEILING, r.site))) {
      capped.add(mailLane(r.site)); // every refused claim still spends a slot: stop asking today
      summary.deferred += 1;
      continue;
    }
    const site = sisterSite(r.site)!;
    const ok = await send(r.email, mail.subject, mail.html, { text: mail.text, headers: stashUnsubscribeHeaders(token, site.key), from: fromFor(site) }, site.key);
    if (ok) {
      summary.emailed += 1;
      await db.sisterStash.update({
        where: { email_site: { email: r.email, site: r.site } },
        data: { lastSentAt: now, lastPrices: priceMemoryOf(lines) as PrismaNS.InputJsonObject },
      });
    } else {
      summary.failed += 1;
      summary.lastError = getLastEmailError();
    }
  }
  return summary;
}

/** True when a site with a due stash email could not read its feed (the job fails, like the alerts). */
export function stashHasSiteFailure(s: StashSummary): boolean {
  return Object.values(s.sites).some((x) => x.due > 0 && x.feed === "error");
}
