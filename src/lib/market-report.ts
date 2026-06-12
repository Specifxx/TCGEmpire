// The automated daily market report — an AFR-style "market wrap" for the Riftbound
// singles market, generated from the live RiftCompare Index and daily price
// history. One report per Sydney calendar day, persisted as a MarketReport row and
// surfaced in the blog. Everything here is grounded ONLY in the numbers — we never
// invent a reason for a move.
import { prisma } from "./db";
import { getMarketIndex } from "./market-index";
import { COUNTRY_LIST, COUNTRIES, type Country } from "./country";
import { formatMoney } from "./format";

// Sydney calendar day (matches the PriceHistory key + the rest of the site).
export function reportDay(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
}
function longDate(day: string): string {
  return new Date(`${day}T00:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

interface MarketLine {
  code: Country;
  place: string;
  currency: string;
  level: number | null; // index level (base 100)
  d1: number | null;
  d7: number | null;
  d30: number | null;
}

export interface GlobalSnapshot {
  markets: MarketLine[];
  liveMarkets: MarketLine[]; // those with an index
  globalLevel: number | null; // mean of live levels
  globalD1: number | null; // mean of live 1-day moves — the headline
  globalD7: number | null;
  globalD30: number | null;
  fellCount: number;
  roseCount: number;
  standout: MarketLine | null; // biggest absolute 1-day move
}

const mean = (xs: number[]): number | null =>
  xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null;

export async function getGlobalSnapshot(): Promise<GlobalSnapshot> {
  const markets: MarketLine[] = [];
  for (const info of COUNTRY_LIST) {
    const idx = await getMarketIndex(info.code).catch(() => null);
    markets.push({
      code: info.code,
      place: info.place,
      currency: info.currency,
      level: idx?.latest ?? null,
      d1: idx?.d1 ?? null,
      d7: idx?.d7 ?? null,
      d30: idx?.d30 ?? null,
    });
  }
  const live = markets.filter((m) => m.level != null);
  const d1s = markets.map((m) => m.d1).filter((x): x is number => x != null);
  const standout = [...markets]
    .filter((m) => m.d1 != null)
    .sort((a, b) => Math.abs(b.d1!) - Math.abs(a.d1!))[0] ?? null;
  return {
    markets,
    liveMarkets: live,
    globalLevel: mean(live.map((m) => m.level!)),
    globalD1: mean(d1s),
    globalD7: mean(markets.map((m) => m.d7).filter((x): x is number => x != null)),
    globalD30: mean(markets.map((m) => m.d30).filter((x): x is number => x != null)),
    fellCount: d1s.filter((x) => x < 0).length,
    roseCount: d1s.filter((x) => x > 0).length,
    standout,
  };
}

// ── Daily card movers (1-day), averaged across markets for a global view ────────
export interface DailyMover {
  name: string;
  slug: string | null;
  id: string;
  setCode: string;
  collectorNumber: string;
  pct: number; // mean 1-day % across markets with data
  priceCents: number; // representative current price (AU pref, else any)
  currency: string;
}

const MIN_MOVER_CENTS = 300; // ignore sub-$3 noise

export async function getGlobalDailyMovers(limit = 6): Promise<{ risers: DailyMover[]; fallers: DailyMover[] }> {
  const since = new Date(Date.now() - 5 * 86400_000);
  const rows = await prisma.priceHistory
    .findMany({
      where: { day: { gte: since } },
      select: { cardId: true, country: true, day: true, lowestPriceCents: true },
      orderBy: { day: "asc" },
    })
    .catch(() => []);
  if (!rows.length) return { risers: [], fallers: [] };

  // Per market: the two most recent distinct days.
  const daysByMarket = new Map<string, number[]>();
  for (const r of rows) {
    const arr = daysByMarket.get(r.country) ?? [];
    const t = r.day.getTime();
    if (!arr.includes(t)) arr.push(t);
    daysByMarket.set(r.country, arr);
  }
  const lastTwo = new Map<string, [number, number] | null>();
  for (const [mkt, days] of daysByMarket) {
    const sorted = [...days].sort((a, b) => b - a);
    lastTwo.set(mkt, sorted.length >= 2 ? [sorted[0], sorted[1]] : null);
  }

  // Per (card, market) price at last & prev day.
  const price = new Map<string, number>(); // `${cardId}|${country}|${t}` -> cents
  for (const r of rows) price.set(`${r.cardId}|${r.country}|${r.day.getTime()}`, r.lowestPriceCents);

  // Aggregate per card: mean 1-day % across markets that have both days + min price.
  const agg = new Map<string, { pcts: number[]; auPrice?: number; anyPrice: number }>();
  const cardIds = new Set(rows.map((r) => r.cardId));
  for (const cardId of cardIds) {
    for (const [mkt, two] of lastTwo) {
      if (!two) continue;
      const now = price.get(`${cardId}|${mkt}|${two[0]}`);
      const prev = price.get(`${cardId}|${mkt}|${two[1]}`);
      if (now == null || prev == null || prev <= 0 || now < MIN_MOVER_CENTS) continue;
      const pct = ((now - prev) / prev) * 100;
      const a = agg.get(cardId) ?? { pcts: [], anyPrice: now };
      a.pcts.push(pct);
      a.anyPrice = mkt === "AU" ? now : a.anyPrice;
      if (mkt === "AU") a.auPrice = now;
      agg.set(cardId, a);
    }
  }

  const scored = [...agg.entries()]
    .map(([cardId, a]) => ({ cardId, pct: a.pcts.reduce((s, x) => s + x, 0) / a.pcts.length, cents: a.auPrice ?? a.anyPrice }))
    .filter((x) => Number.isFinite(x.pct));

  const top = (dir: "up" | "down") =>
    scored
      .filter((x) => (dir === "up" ? x.pct > 0.5 : x.pct < -0.5))
      .sort((a, b) => (dir === "up" ? b.pct - a.pct : a.pct - b.pct))
      .slice(0, limit);
  const riserStats = top("up");
  const fallerStats = top("down");

  const ids = [...new Set([...riserStats, ...fallerStats].map((x) => x.cardId))];
  if (!ids.length) return { risers: [], fallers: [] };
  const cards = await prisma.card.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, slug: true, setCode: true, collectorNumber: true },
  });
  const byId = new Map(cards.map((c) => [c.id, c]));
  const shape = (x: { cardId: string; pct: number; cents: number }): DailyMover | null => {
    const c = byId.get(x.cardId);
    if (!c) return null;
    return {
      id: c.id, name: c.name, slug: c.slug, setCode: c.setCode, collectorNumber: c.collectorNumber,
      pct: Math.round(x.pct * 10) / 10, priceCents: x.cents, currency: "AUD",
    };
  };
  const clean = (arr: ReturnType<typeof shape>[]) => arr.filter((m): m is DailyMover => m !== null);
  return { risers: clean(riserStats.map(shape)), fallers: clean(fallerStats.map(shape)) };
}

// ── Prose ───────────────────────────────────────────────────────────────────────
function verb(pct: number | null): { word: string; emoji: string } {
  if (pct == null) return { word: "holds steady", emoji: "➖" };
  if (pct >= 1) return { word: "rallies", emoji: "📈" };
  if (pct >= 0.15) return { word: "edges up", emoji: "📈" };
  if (pct > -0.15) return { word: "holds steady", emoji: "➖" };
  if (pct > -1) return { word: "eases", emoji: "📉" };
  return { word: "slides", emoji: "📉" };
}
const signed = (p: number | null) => (p == null ? "—" : `${p > 0 ? "+" : ""}${p.toFixed(2)}%`);
const arrow = (p: number | null) => (p == null ? "" : p > 0 ? "▲" : p < 0 ? "▼" : "■");

export function buildReport(day: string, snap: GlobalSnapshot, movers: { risers: DailyMover[]; fallers: DailyMover[] }) {
  const v = verb(snap.globalD1);
  const dateLabel = longDate(day);
  const lvl = snap.globalLevel != null ? snap.globalLevel.toFixed(1) : "—";
  const n = snap.liveMarkets.length;

  const title = `RiftCompare Index ${v.word} (${signed(snap.globalD1)}) — Riftbound market report, ${dateLabel}`;
  const excerpt =
    snap.globalD1 == null
      ? `The RiftCompare Index is establishing its baseline across the Riftbound singles market. Here's where each region stands today.`
      : `The global RiftCompare Index ${v.word} ${signed(snap.globalD1)} to ${lvl} as ${snap.fellCount} of ${n} tracked markets ${snap.fellCount === 1 ? "fell" : "fell"}. A region-by-region breakdown of the Riftbound market.`;

  const md: string[] = [];

  // Lede
  if (snap.globalD1 == null) {
    md.push(`The **RiftCompare Index** — our cross-market gauge of the Riftbound singles market — is still building its first days of history. Below is where each region stands as the data accrues.`);
  } else {
    md.push(
      `The **RiftCompare Index** ${v.emoji} ${v.word} **${signed(snap.globalD1)}** overnight to **${lvl}**, as the Riftbound singles market ${snap.globalD1 < 0 ? "came off" : snap.globalD1 > 0 ? "pushed" : "held"} ahead of the Wall Street pre-market open. ${snap.fellCount} of the ${n} regional markets we track ${snap.fellCount === 1 ? "closed lower" : "closed lower"} on the day, with ${snap.roseCount} ${snap.roseCount === 1 ? "higher" : "higher"}.`
    );
  }

  // Regional breakdown (bulleted — our Markdown renderer doesn't do tables).
  md.push(`## Markets at a glance\n\n${snap.markets
    .map(
      (m) =>
        `- ${COUNTRIES[m.code].flag} **${m.place}** — ${m.level != null ? `Index **${m.level.toFixed(1)}**` : "Index —"} · 1-day ${arrow(m.d1)} ${signed(m.d1)} · 7-day ${arrow(m.d7)} ${signed(m.d7)} · 30-day ${arrow(m.d30)} ${signed(m.d30)}`
    )
    .join("\n")}`);

  // Regional spotlight
  if (snap.standout && snap.standout.d1 != null && Math.abs(snap.standout.d1) >= 0.2) {
    const s = snap.standout;
    const sd1 = s.d1 ?? 0;
    md.push(
      `## Regional spotlight: ${s.place}\n\n${COUNTRIES[s.code].flag} **${s.place}** was the standout, its index **${sd1 > 0 ? "up" : "down"} ${signed(sd1)}** on the day — the largest one-day move of any region${
        snap.globalD1 != null && Math.abs(sd1 - snap.globalD1) > 0.2
          ? `, diverging from the **${signed(snap.globalD1)}** global average`
          : ""
      }. Over the past week it is ${arrow(s.d7)} ${signed(s.d7)}, and over 30 days ${arrow(s.d30)} ${signed(s.d30)}.`
    );
  }

  // Movers
  const moverLines = (arr: DailyMover[]) =>
    arr.map((m) => `- **[${m.name}](/card/${m.slug ?? m.id})** (${m.setCode} ${m.collectorNumber}) — ${arrow(m.pct)} **${m.pct > 0 ? "+" : ""}${m.pct}%** to ${formatMoney(m.priceCents, m.currency)}`).join("\n");
  if (movers.risers.length || movers.fallers.length) {
    md.push(`## Movers of the day`);
    if (movers.risers.length) md.push(`**Biggest risers**\n\n${moverLines(movers.risers)}`);
    if (movers.fallers.length) md.push(`**Biggest fallers**\n\n${moverLines(movers.fallers)}`);
    md.push(`_Card moves are the average one-day change in the lowest live price across the markets where the card trades._`);
  }

  // Outlook + links
  md.push(
    `## The takeaway\n\n${
      snap.globalD1 == null
        ? "With the Index still finding its feet, the picture sharpens daily."
        : Math.abs(snap.globalD1) < 0.15
          ? "A quiet session overall — the kind of flat tape that often precedes a set release or a tournament weekend rather than reacting to one."
          : snap.globalD1 < 0
            ? "A softer session for sellers, but softer prices are exactly when buyers find value — check the drops before they bounce."
            : "A firmer session across the board — momentum worth watching if you're holding singles."
    } Track the live numbers any time on the **[RiftCompare Index](/market)**, see the full **[price movers](/movers)**, or **[browse every card](/browse)** to find your next pickup.`
  );

  md.push(`---\n\n*The RiftCompare Index is a search-weighted gauge of the most-traded Riftbound cards in each market, rebased to 100 at the start of its history; the global figure is the average of the regional indices. Generated automatically from live data each day at Wall Street pre-market open. Informational only — not financial advice.*`);

  const body = md.join("\n\n");
  const readMins = Math.max(2, Math.round(body.split(/\s+/).length / 200));
  return { title, excerpt, body, readMins };
}

// Idempotent: create today's report if it doesn't exist; returns the row.
export async function ensureMarketReport(day = reportDay()): Promise<{ slug: string; created: boolean } | null> {
  const existing = await prisma.marketReport.findUnique({ where: { day }, select: { slug: true } });
  if (existing) return { slug: existing.slug, created: false };

  const snap = await getGlobalSnapshot();
  // Don't publish an empty report if there's literally no index yet.
  if (!snap.liveMarkets.length) return null;
  const movers = await getGlobalDailyMovers(6);
  const { title, excerpt, body, readMins } = buildReport(day, snap, movers);
  const slug = `riftbound-market-report-${day}`;

  try {
    await prisma.marketReport.create({
      data: { slug, day, title, excerpt, body, globalChangePct: snap.globalD1 ?? null },
    });
  } catch {
    // Unique race — another request created it first.
    return { slug, created: false };
  }
  // readMins is recomputed on read (see lib/posts), so it isn't stored.
  void readMins;
  return { slug, created: true };
}
