import { prisma } from "./db";
import { setByCode, isPreorderSetCode } from "./constants";
import { priceField, type Country } from "./country";
import { cardHref } from "./card-url";
import { getPreorderGroups } from "./sealed-import";
import { offerStock, soldOutEverywhere } from "./sealed-offers";
import { emailShell, sendEmail } from "./email";
import {
  RELEASE_ALERT_SEND_CAP,
  buildReleaseEmail,
  groupByEmail,
  releaseCounterKey,
  releaseOneClickUrl,
  renderReleaseEmailHtml,
  renderReleaseEmailText,
  restockTransitions,
  singlesNotices,
  type OfferState,
  type ReleaseAlertRow,
  type RestockNotice,
  type SinglesFacts,
  type SinglesNotice,
} from "./release-alerts";

// The release-alert run (lib/release-alerts.ts has the rules). Called by
// /api/cron/release-alerts after each price import. Reads are per-set and
// narrow: a count per market, the few card-scoped cards, one set's pre-orders.

export interface ReleaseRunSummary {
  setCode: string;
  pending: number;
  sent: number;
  failed: number;
  held: number;
  restocked: Record<string, string[]>;
}

export async function runReleaseAlerts(setCode: string, opts: { dryRun?: boolean } = {}): Promise<ReleaseRunSummary> {
  const set = setByCode(setCode);
  const summary: ReleaseRunSummary = { setCode, pending: 0, sent: 0, failed: 0, held: 0, restocked: {} };
  if (!set) return summary;

  const rows: ReleaseAlertRow[] = await prisma.setReleaseAlert.findMany({
    where: { setCode, OR: [{ singlesNotifiedAt: null }, { restockNotifiedAt: null }] },
    select: { id: true, email: true, scope: true, market: true, unsubToken: true, singlesNotifiedAt: true, restockNotifiedAt: true },
    orderBy: { createdAt: "asc" },
    take: 5000,
  });
  summary.pending = rows.length;
  if (!rows.length) return summary;

  const muted = new Set(
    (await prisma.alertMute.findMany({ where: { email: { in: [...new Set(rows.map((r) => r.email))] } }, select: { email: true } })).map(
      (m) => m.email,
    ),
  );
  const live = rows.filter((r) => !muted.has(r.email));
  const markets = [...new Set(live.map((r) => r.market))] as Country[];

  // ── Singles facts ──────────────────────────────────────────────────────────
  const facts: SinglesFacts = { pricedCount: {}, cards: {} };
  for (const m of markets) {
    facts.pricedCount[m] = await prisma.card.count({ where: { setCode, [priceField(m)]: { not: null } } });
  }
  const cardIds = [...new Set(live.filter((r) => r.scope !== "set" && !r.singlesNotifiedAt).map((r) => r.scope))];
  if (cardIds.length) {
    const cards = await prisma.card.findMany({
      where: { id: { in: cardIds }, setCode },
      select: {
        id: true, slug: true, name: true,
        lowestPriceCents: true, lowestPriceCentsUs: true, lowestPriceCentsUk: true,
        lowestPriceCentsSg: true, lowestPriceCentsCa: true, lowestPriceCentsEu: true,
      },
    });
    for (const c of cards) {
      const price: Partial<Record<Country, number | null>> = {};
      for (const m of markets) price[m] = (c as unknown as Record<string, number | null>)[priceField(m)] ?? null;
      facts.cards[c.id] = { name: c.name, href: cardHref(c), price };
    }
  }
  const singles = singlesNotices(live, facts);

  // ── Restock transitions (only while the set is unreleased) ─────────────────
  const restockByMarket = new Map<Country, string[]>();
  if (isPreorderSetCode(setCode)) {
    for (const m of markets) {
      if (!live.some((r) => r.market === m && !r.restockNotifiedAt)) continue;
      const groups = (await getPreorderGroups(m).catch(() => [])).filter((g) => g.setCode === setCode);
      const products = groups.map((g) => {
        const state: OfferState = soldOutEverywhere(g.listings)
          ? "soldout"
          : g.listings.some((l) => offerStock(l) === "open")
            ? "open"
            : "other";
        return { key: g.groupKey, name: g.name, state };
      });
      const prefix = releaseCounterKey(setCode, m, "");
      const prev = new Set(
        (await prisma.counter.findMany({ where: { key: { startsWith: prefix } }, select: { key: true } })).map((c) => c.key.slice(prefix.length)),
      );
      const t = restockTransitions(products, prev);
      if (!opts.dryRun) {
        for (const k of t.markSoldOut) {
          const key = releaseCounterKey(setCode, m, k);
          await prisma.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: 1 } });
        }
        if (t.clear.length) {
          await prisma.counter.deleteMany({ where: { key: { in: t.clear.map((k) => releaseCounterKey(setCode, m, k)) } } });
        }
      }
      if (t.restocked.length) {
        const names = t.restocked.map((k) => products.find((p) => p.key === k)?.name ?? k);
        restockByMarket.set(m, names);
        summary.restocked[m] = names;
      }
    }
  }

  // ── Compose one email per address ───────────────────────────────────────────
  const setPath = `/sets/${set.slug}`;
  let budget = RELEASE_ALERT_SEND_CAP;
  for (const [email, own] of groupByEmail(live)) {
    const notices: (SinglesNotice | RestockNotice)[] = [];
    const singlesRows = own.filter((r) => singles.has(r.id));
    if (singlesRows.length) {
      // A card-scoped notice names the card; prefer it over the set-wide one.
      const pick = singlesRows.map((r) => singles.get(r.id)!).sort((a, b) => Number(!!b.card) - Number(!!a.card))[0];
      notices.push(pick);
    }
    const restockRows = own.filter((r) => !r.restockNotifiedAt && restockByMarket.has(r.market as Country));
    if (restockRows.length) {
      const m = restockRows[0].market as Country;
      notices.push({ kind: "restock", market: m, products: restockByMarket.get(m)! });
    }
    if (!notices.length) continue;
    if (budget <= 0) {
      summary.held++;
      continue;
    }
    budget--;
    const token = own[0].unsubToken;
    const built = buildReleaseEmail(set.name, setPath, notices);
    if (opts.dryRun) {
      summary.sent++;
      continue;
    }
    const ok = await sendEmail(email, built.subject, renderReleaseEmailHtml(built, token, emailShell), {
      text: renderReleaseEmailText(built, token),
      headers: { "List-Unsubscribe": `<${releaseOneClickUrl(token)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    if (!ok) {
      summary.failed++;
      continue;
    }
    summary.sent++;
    const now = new Date();
    if (singlesRows.length) {
      await prisma.setReleaseAlert.updateMany({ where: { id: { in: singlesRows.map((r) => r.id) } }, data: { singlesNotifiedAt: now } });
    }
    if (restockRows.length) {
      await prisma.setReleaseAlert.updateMany({ where: { id: { in: restockRows.map((r) => r.id) } }, data: { restockNotifiedAt: now } });
    }
  }
  return summary;
}
