// The daily sister-site alert check (/api/cron/sister-alerts, called by
// .github/workflows/sister-alerts.yml). For every confirmed address's alerts:
// fetch each site's /alert-feed.json once, decide with evaluateAlert, send one
// email per (address, site) under the shared alert budget, and keep the rows
// tidy (expired, missing, unconfirmed). Throws only when it cannot read its own
// tables; a site whose feed fails is reported and its alerts are left as they were.
import type { prisma as Prisma } from "../db";
import { sendEmail, getLastEmailError } from "../email";
import { recentlyEmailedAddresses, type AlertBudgetDb } from "../alert-budget";
import { ALERT_BUDGET_WINDOW_MS, alertDailyBudget } from "../price-alerts";
import { fetchFeed as realFetchFeed, feedIsFresh, type AlertFeed } from "./feed";
import { evaluateAlert, isRestockTarget, UNCONFIRMED_TTL_MS } from "./evaluate";
import { buildAlertEmail, fromFor, listUnsubscribeHeaders, type DealPick, type FiredAlert } from "./email";
import { SISTER_ALERT_SITES, sisterSite, type SisterAlertSite, type SisterRegion } from "./sites";
import { claimMailSlot } from "./mail-cap";

type Db = typeof Prisma;

export interface RunDeps {
  db: Db;
  now?: Date;
  fetchFeed?: (site: SisterAlertSite) => Promise<AlertFeed>;
  send?: (to: string, subject: string, html: string, extras: { text: string; headers: Record<string, string>; from: string }) => Promise<boolean>;
  dryRun?: boolean;
}

export interface RunSummary {
  alerts: number;
  sites: Record<string, { alerts: number; feed: "ok" | "stale" | "error" | "unused"; error?: string }>;
  fired: number;
  emailed: number;
  deferred: number;
  failed: number;
  expired: number;
  unconfirmedRemoved: number;
  lastError?: string | null;
  dryRun: boolean;
}

/** Deterministic pick of one sister deal in the same group and region (a day's rotation). */
export function pickDeal(fromSite: SisterAlertSite, region: SisterRegion, feeds: Map<string, AlertFeed>, now: Date): DealPick | null {
  const pool: DealPick[] = [];
  for (const s of SISTER_ALERT_SITES) {
    if (s.key === fromSite.key || s.group !== fromSite.group) continue;
    const f = feeds.get(s.key);
    if (!f) continue;
    for (const d of f.deals) if (d.r === region) pool.push({ site: s, deal: d });
  }
  if (!pool.length) return null;
  const day = Math.floor(now.getTime() / 86_400_000);
  return pool[day % pool.length]!;
}

export async function runSisterAlerts(deps: RunDeps): Promise<RunSummary> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const fetchFeed = deps.fetchFeed ?? ((s: SisterAlertSite) => realFetchFeed(s));
  const send = deps.send ?? ((to, subject, html, extras) => sendEmail(to, subject, html, extras));
  const dryRun = !!deps.dryRun;
  const summary: RunSummary = { alerts: 0, sites: {}, fired: 0, emailed: 0, deferred: 0, failed: 0, expired: 0, unconfirmedRemoved: 0, dryRun };

  // 1. Unconfirmed addresses older than a week go, with their alerts.
  const stale = await db.sisterAlertAddress.findMany({
    where: { confirmedAt: null, createdAt: { lt: new Date(now.getTime() - UNCONFIRMED_TTL_MS) } },
    select: { email: true },
    take: 2000,
  });
  if (stale.length && !dryRun) {
    const emails = stale.map((r) => r.email);
    await db.sisterAlert.deleteMany({ where: { email: { in: emails } } });
    await db.sisterDigest.deleteMany({ where: { email: { in: emails } } });
    await db.sisterAlertAddress.deleteMany({ where: { email: { in: emails }, confirmedAt: null } });
  }
  summary.unconfirmedRemoved = stale.length;

  // 2. Confirmed addresses and their alerts (bounded reads, only the columns used).
  const addresses = await db.sisterAlertAddress.findMany({ where: { confirmedAt: { not: null } }, select: { email: true, token: true }, take: 20000 });
  const tokenOf = new Map(addresses.map((a) => [a.email, a.token]));
  const alerts = (
    await db.sisterAlert.findMany({
      select: { id: true, email: true, site: true, productId: true, region: true, targetCents: true, name: true, path: true, lastPriceCents: true, lastNotifiedCents: true, lastNotifiedAt: true, missingSince: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 50000,
    })
  ).filter((a) => tokenOf.has(a.email) && sisterSite(a.site));
  summary.alerts = alerts.length;

  // 3. Feeds: every site with alerts, plus its group's sisters for the closing deal.
  const alertSites = new Set(alerts.map((a) => a.site));
  const groups = new Set([...alertSites].map((k) => sisterSite(k)!.group));
  const feeds = new Map<string, AlertFeed>();
  for (const s of SISTER_ALERT_SITES) {
    const count = alerts.filter((a) => a.site === s.key).length;
    if (!groups.has(s.group)) {
      summary.sites[s.key] = { alerts: 0, feed: "unused" };
      continue;
    }
    try {
      const f = await fetchFeed(s);
      if (!feedIsFresh(f, now)) {
        summary.sites[s.key] = { alerts: count, feed: "stale", error: `generated ${f.generatedAt}` };
        continue;
      }
      feeds.set(s.key, f);
      summary.sites[s.key] = { alerts: count, feed: "ok" };
    } catch (e) {
      summary.sites[s.key] = { alerts: count, feed: "error", error: e instanceof Error ? e.message : String(e) };
    }
  }

  // 4. Decide.
  const fired = new Map<string, FiredAlert[]>(); // key: email \u0000 site
  const expired: string[] = [];
  const updates: { id: string; data: Record<string, unknown> }[] = [];
  for (const a of alerts) {
    const feed = feeds.get(a.site);
    if (!feed) continue; // feed failed or stale: leave the alert exactly as it was
    const item = feed.items[a.productId];
    const region = a.region as SisterRegion;
    const price = item?.p[region] ?? null;
    const v = evaluateAlert(a, price, now);
    const meta: Record<string, unknown> = {};
    if (item && (item.n !== a.name || item.u !== a.path)) Object.assign(meta, { name: item.n, path: item.u });
    if (v.kind === "expire") {
      expired.push(a.id);
      continue;
    }
    if (v.kind === "fire" && item) {
      const key = `${a.email}\u0000${a.site}`;
      const list = fired.get(key) ?? [];
      list.push({ id: a.id, site: a.site, name: item.n, path: item.u, region, priceCents: v.priceCents, targetCents: a.targetCents, restock: isRestockTarget(a.targetCents) });
      fired.set(key, list);
      updates.push({ id: a.id, data: { ...meta, lastPriceCents: v.priceCents, lastCheckedAt: now, missingSince: null } });
      continue;
    }
    if (v.kind === "hold") {
      const data: Record<string, unknown> = { ...meta };
      if (v.priceCents !== a.lastPriceCents) data.lastPriceCents = v.priceCents;
      if ((v.missingSince?.getTime() ?? null) !== (a.missingSince?.getTime() ?? null)) data.missingSince = v.missingSince;
      if (v.rearm) data.lastNotifiedCents = null;
      if (Object.keys(data).length) updates.push({ id: a.id, data: { ...data, lastCheckedAt: now } });
    }
  }
  summary.fired = [...fired.values()].reduce((n, l) => n + l.length, 0);
  summary.expired = expired.length;

  // 5. Send, under the shared alert budget (distinct addresses, every run) and the service's own daily cap.
  const budget = alertDailyBudget();
  const recent = fired.size ? await recentlyEmailedAddresses(db as unknown as AlertBudgetDb, now, ALERT_BUDGET_WINDOW_MS) : new Set<string>();
  const sentIds: { id: string; priceCents: number }[] = [];
  for (const [key, list] of fired) {
    const [email, siteKey] = key.split("\u0000") as [string, string];
    const site = sisterSite(siteKey)!;
    if (!recent.has(email) && recent.size >= budget) {
      summary.deferred += list.length;
      continue;
    }
    if (dryRun) {
      summary.emailed += 1;
      continue;
    }
    if (!(await claimMailSlot(db, now))) {
      summary.deferred += list.length;
      continue;
    }
    const token = tokenOf.get(email)!;
    const mail = buildAlertEmail(siteKey, list, token, pickDeal(site, list[0]!.region, feeds, now));
    const ok = await send(email, mail.subject, mail.html, { text: mail.text, headers: listUnsubscribeHeaders(token), from: fromFor(site) });
    if (ok) {
      summary.emailed += 1;
      recent.add(email);
      for (const a of list) sentIds.push({ id: a.id, priceCents: a.priceCents });
    } else {
      summary.failed += 1;
      summary.lastError = getLastEmailError();
    }
  }

  // 6. Write: stamps only for what was sent, then the bookkeeping, then removals.
  if (!dryRun) {
    const sent = new Map(sentIds.map((s) => [s.id, s.priceCents]));
    for (const u of updates) {
      const p = sent.get(u.id);
      await db.sisterAlert.update({ where: { id: u.id }, data: p != null ? { ...u.data, lastNotifiedCents: p, lastNotifiedAt: now } : u.data });
    }
    if (expired.length) await db.sisterAlert.deleteMany({ where: { id: { in: expired } } });
  }
  return summary;
}

/** True when a site that HAS alerts could not be checked: the run should fail so the monitor sees it. */
export function runHasSiteFailure(s: RunSummary): boolean {
  return Object.values(s.sites).some((x) => x.alerts > 0 && x.feed !== "ok");
}
