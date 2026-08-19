// Daily "Arbitrage Alerts" digest — a Premium perk, automatic like every other
// Premium feature (no separate opt-in; see the tier note in lib/premium.ts).
// Reuses lib/arbitrage.ts's engine as-is: getArbitrage (store buy → eBay sell,
// the same "flip" shape the Deal Finder itself ranks by) for same-market flips,
// and getCrossRegionGaps for "cheaper in another market" — both already built,
// tested and live behind the Deal Finder page, so this is purely a scheduling +
// email layer on top, not a new pricing engine.
import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { SITE_URL } from "./site";
import { COUNTRY_LIST, currencyOf, type Country } from "./country";
import { cardHref } from "./card-url";
import { getArbSources, getArbitrage, getCrossRegionGaps } from "./arbitrage";
import { sendArbitrageAlertEmail, type ArbitrageAlertFlip, type ArbitrageAlertGap } from "./email";
import { NOT_SEED_WHERE } from "./premium";

const TOP_FLIPS = 5;
const TOP_GAPS = 5;
const VALID_COUNTRIES: Set<string> = new Set(COUNTRY_LIST.map((c) => c.code));

interface CountryDigest {
  flips: ArbitrageAlertFlip[];
  gaps: ArbitrageAlertGap[];
}

// Computed ONCE PER COUNTRY, not once per recipient — many Premium members
// share a market, and getArbitrage/getCrossRegionGaps are real queries, not
// free. Same reasoning as lib/arbitrage.ts's own per-request memoization, just
// scoped to one cron run instead of a TTL (a run takes seconds, not minutes).
async function buildDigestFor(country: Country): Promise<CountryDigest> {
  const sources = getArbSources(country);
  const storeKeys = sources.filter((s) => !s.isEbay).map((s) => s.key);
  const ebayKeys = sources.filter((s) => s.isEbay).map((s) => s.key);
  const currency = currencyOf(country);

  const [arb, xregion] = await Promise.all([
    ebayKeys.length
      ? getArbitrage(country, { buy: storeKeys, sell: ebayKeys, sort: "profit", pageSize: TOP_FLIPS })
      : Promise.resolve({ items: [], total: 0, page: 1, pageSize: TOP_FLIPS, pageCount: 1 }),
    getCrossRegionGaps(country, 1, TOP_GAPS),
  ]);

  const flips: ArbitrageAlertFlip[] = arb.items.slice(0, TOP_FLIPS).map((i) => ({
    name: i.card.name,
    setCode: i.card.setCode,
    collectorNumber: i.card.collectorNumber,
    url: `${SITE_URL}${cardHref(i.card)}`,
    currency,
    buyCents: i.buyCents,
    buyStoreName: i.buyStoreName,
    sellCents: i.sellCents,
    sellName: i.sellName,
    netCents: i.netCents,
    marginPct: i.marginPct,
  }));

  const gaps: ArbitrageAlertGap[] = xregion.items.slice(0, TOP_GAPS).map((g) => ({
    name: g.card.name,
    setCode: g.card.setCode,
    collectorNumber: g.card.collectorNumber,
    url: `${SITE_URL}${cardHref(g.card)}`,
    homeCurrency: g.homeCurrency,
    homeCents: g.homeCents,
    awayLabel: g.awayCountry,
    awayCentsConverted: g.awayCentsConverted,
    gapPct: g.gapPct,
  }));

  return { flips, gaps };
}

export async function runArbitrageAlerts(): Promise<number> {
  const now = new Date();
  const [users, optOutRows] = await Promise.all([
    prisma.user.findMany({
      where: { AND: [NOT_SEED_WHERE, { OR: [{ premiumUntil: { gt: now } }, { isAdmin: true }] }] },
      select: { email: true, preferredCountry: true },
    }),
    prisma.arbitrageAlertOptOut.findMany({ select: { email: true, token: true, optedOutAt: true } }),
  ]);
  const optOutByEmail = new Map(optOutRows.map((r) => [r.email, r]));
  const audience = users.filter((u) => {
    const key = u.email.trim().toLowerCase();
    return !optOutByEmail.get(key)?.optedOutAt;
  });
  if (!audience.length) return 0;

  const digestCache = new Map<Country, CountryDigest>();
  async function digestFor(country: Country): Promise<CountryDigest> {
    const hit = digestCache.get(country);
    if (hit) return hit;
    const built = await buildDigestFor(country);
    digestCache.set(country, built);
    return built;
  }

  let sent = 0;
  for (const u of audience) {
    const country: Country = VALID_COUNTRIES.has(u.preferredCountry ?? "") ? (u.preferredCountry as Country) : "AU";
    const { flips, gaps } = await digestFor(country);
    if (!flips.length && !gaps.length) continue; // nothing worth emailing today

    const key = u.email.trim().toLowerCase();
    const token = optOutByEmail.get(key)?.token ?? randomUUID();
    // Lazily mint the opt-out row on first send, same idempotent-upsert pattern
    // as lib/user-digest.ts — never overwrites an existing optedOutAt.
    await prisma.arbitrageAlertOptOut.upsert({ where: { email: key }, create: { email: key, token }, update: {} }).catch(() => {});
    const unsubUrl = `${SITE_URL}/arbitrage-alerts/unsubscribe?token=${encodeURIComponent(token)}`;
    const ok = await sendArbitrageAlertEmail(u.email, flips, gaps, unsubUrl).catch(() => false);
    if (ok) sent++;
  }
  return sent;
}
