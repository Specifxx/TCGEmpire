import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { CONTENT_TAG } from "@/lib/revalidate-content";
import { SETS } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";
import { BoxEvCalculator, type BoxEvSet, type PullCard } from "@/components/BoxEvCalculator";
import { poolOf, POOL_ORDER, type PoolKey } from "@/lib/box-ev";
import { pageAlternates } from "@/lib/seo";
import { AdSlot } from "@/components/AdSlot";

// ─────────────────────────────────────────────────────────────────────────────
// /tools/box-ev — what is a sealed box actually worth if you open it?
// ─────────────────────────────────────────────────────────────────────────────
// REAL ISR NOW. This route used to call getCountry(), which reads cookies() and
// therefore made `revalidate` inert — every single visit re-rendered the page
// and re-ran both queries. It no longer needs to know the country: every card is
// valued in USD and the CLIENT converts to the viewer's currency, exactly as
// TcgMarketPrice and the set galleries already do. One cached render now serves
// every visitor and every crawler.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: { absolute: "Riftbound Booster Box EV Calculator — Is a Box Worth Opening? | RiftCompare" },
  description:
    "Expected value of a Riftbound booster box, built from TCGplayer market prices and including the signature, over-numbered and alt-art chase pulls that most EV maths leaves out. Tune the pull rates yourself.",
  keywords: [
    "Riftbound box EV",
    "Riftbound booster box value",
    "is a Riftbound booster box worth it",
    "Riftbound expected value",
    "TCG box EV calculator",
  ],
  alternates: pageAlternates("/tools/box-ev"),
  openGraph: {
    title: "Riftbound Booster Box EV Calculator",
    description: "Expected value per box from real market prices — is opening worth it?",
    url: `${SITE_URL}/tools/box-ev`,
  },
};

// How many cards per pool to ship for the visual "what you're chasing" grid.
// Capped hard: the POOLS are computed from every card, but only a handful get a
// picture. A 200-tile grid on an ISR page costs more in HTML weight and LCP than
// it earns, and the grid's job is to show the top of each pool, not all of it.
const GRID_PER_POOL = 8;

// ── Data ─────────────────────────────────────────────────────────────────────
// ONE pricing basis for everything: the TCGplayer US market price. It is
// TCGplayer's own English fair-market figure — deliberately not the cheapest
// listing, which is frequently a foreign-language copy (see lib/tcgplayer.ts) —
// it exists for essentially every card, and being one number for all markets
// means the EV is comparable everywhere and only the currency changes.
const getBoxEvData = unstable_cache(
  async () => {
    const tcgUs = await prisma.retailerPrice
      .findMany({
        // Literals rather than importing TCG_US, so this page doesn't drag the
        // whole importer module graph into the server bundle.
        where: { retailer: "tcgplayer", country: "US" },
        select: { cardId: true, priceCents: true, isFoil: true },
      })
      .catch(() => [] as { cardId: string; priceCents: number; isFoil: boolean }[]);

    const cards = await prisma.card
      .findMany({
        // Promos excluded: they come from events and box toppers, not packs.
        // `variant: null` is DELIBERATELY no longer filtered — alt-art clones
        // are a chase pool now rather than something to hide.
        where: { isPromo: false },
        select: {
          id: true, slug: true, name: true, setCode: true, rarity: true,
          collectorNumber: true, variant: true, isOvernumbered: true,
          imageThumbUrl: true, orientation: true, domain: true, type: true,
        },
      })
      .catch(() => [] as CardRow[]);

    return { tcgUs, cards };
  },
  ["box-ev-usd-basis"],
  { revalidate: 86400, tags: [CONTENT_TAG] },
);

type CardRow = {
  id: string; slug: string | null; name: string; setCode: string; rarity: string;
  collectorNumber: string; variant: string | null; isOvernumbered: boolean;
  imageThumbUrl: string | null; orientation: string | null;
  domain: string; type: string;
};

export default async function BoxEvPage() {
  const { tcgUs, cards } = await getBoxEvData();

  // One canonical USD value per card. Non-foil is the headline; a foil row is
  // only a fallback, because a foil-only print is a different physical product
  // from the base pull — cards priced that way are flagged rather than silently
  // blended in. Mirrors CardMarketSection's resolution exactly.
  const usdByCard = new Map<string, number>();
  const foilOnly = new Set<string>();
  for (const r of tcgUs) {
    if (!r.isFoil) continue;
    usdByCard.set(r.cardId, r.priceCents);
    foilOnly.add(r.cardId);
  }
  for (const r of tcgUs) {
    if (r.isFoil) continue;
    usdByCard.set(r.cardId, r.priceCents);
    foilOnly.delete(r.cardId);
  }

  // Aggregate per set, per pool. Everything stays in USD cents end to end; the
  // single conversion happens in the browser at render time.
  type Cell = { sum: number; priced: number; total: number; top: number; cards: PullCard[] };
  const bySet = new Map<string, Map<PoolKey, Cell>>();

  for (const c of cards) {
    const pool = poolOf(c);
    if (!pool) continue;
    const pools = bySet.get(c.setCode) ?? new Map<PoolKey, Cell>();
    bySet.set(c.setCode, pools);
    const cell = pools.get(pool) ?? { sum: 0, priced: 0, total: 0, top: 0, cards: [] };
    cell.total += 1;
    const usd = usdByCard.get(c.id) ?? null;
    if (usd != null && usd > 0) {
      cell.sum += usd;
      cell.priced += 1;
      if (usd > cell.top) cell.top = usd;
    }
    cell.cards.push({
      id: c.id,
      slug: c.slug ?? c.id,
      name: c.name,
      rarity: c.rarity,
      collectorNumber: c.collectorNumber,
      usdCents: usd,
      foil: foilOnly.has(c.id),
      imageThumbUrl: c.imageThumbUrl,
      orientation: c.orientation,
      domain: c.domain,
      type: c.type,
    });
    pools.set(pool, cell);
  }

  const sets: BoxEvSet[] = SETS.filter((s) => !s.comingSoon && bySet.has(s.code)).map((s) => {
    const pools = bySet.get(s.code)!;
    return {
      setCode: s.code,
      setName: s.name,
      pools: POOL_ORDER.filter((p) => pools.has(p)).map((pool) => {
        const cell = pools.get(pool)!;
        return {
          pool,
          avgUsdCents: cell.total > 0 ? Math.round(cell.sum / cell.total) : 0,
          topUsdCents: cell.top,
          priced: cell.priced,
          total: cell.total,
          // Most valuable first — the grid answers "what am I actually chasing".
          top: [...cell.cards].sort((a, b) => (b.usdCents ?? 0) - (a.usdCents ?? 0)).slice(0, GRID_PER_POOL),
        };
      }),
    };
  });

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Box EV Calculator", item: `${SITE_URL}/tools/box-ev` },
    ],
  };
  const appLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Riftbound Booster Box EV Calculator",
    url: `${SITE_URL}/tools/box-ev`,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web",
    // USD, not the viewer's currency. The tool is free and the price basis is
    // USD; naming a converted currency here would imply a converted price.
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    description:
      "Free Riftbound booster box expected-value calculator: values every card at its TCGplayer market price, includes signature, over-numbered and alt-art chase pulls, and lets you tune the pull rates.",
  };

  return (
    <div className="mx-auto max-w-4xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbLd, appLd]) }} />

      <div className="mb-5">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <span className="text-slate-300">Box EV Calculator</span>
        </nav>
        <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">Booster Box EV Calculator</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          Is a Riftbound booster box worth opening? Every card is valued at its{" "}
          <strong className="text-slate-200">TCGplayer market price</strong>, and the chase prints most EV maths
          quietly ignores — signatures, over-numbers and alt arts — are counted here. Tune the pack structure to
          the box you&apos;re actually buying and the maths does the rest.
        </p>
      </div>

      {sets.length === 0 ? (
        // Fails open: a DB blip renders an explanation, never a 500 on an
        // indexed page.
        <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
          <div>
            <p className="text-base font-semibold text-white">Price data is still warming up</p>
            <p className="mt-1 text-sm">
              This tool runs off the daily market-price import. Check back shortly, or{" "}
              <Link href="/browse" className="text-brand-400 hover:underline">browse cards</Link> meanwhile.
            </p>
          </div>
        </div>
      ) : (
        <BoxEvCalculator sets={sets} />
      )}

      <AdSlot className="mt-6" height={100} />

      <section className="card-surface mt-6 p-5">
        <h2 className="font-bold text-white">How this works (and what EV can&apos;t tell you)</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Expected value multiplies each pool&apos;s average card price by how many of that pool a pack yields,
          then sums across the box. Two things make this number different from the usual back-of-envelope
          version. First, <strong className="text-slate-200">chase prints are included</strong>: a signature or
          over-numbered card is rare enough that it barely moves a per-pack average, but across 24 packs it is a
          real share of what you paid for — leaving it out understates every box. Second, every card is valued at
          the <strong className="text-slate-200">TCGplayer market price</strong> rather than the cheapest listing
          we can find, because the cheapest listing is often a foreign-language copy or carries a shipping floor
          that has nothing to do with the card.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          What it can&apos;t tell you: whether <em>your</em> box is worth opening. EV is an average across many
          boxes, and the distribution is brutally skewed — most boxes land under the average and a few land far
          over it, because that is exactly what a 1-in-several-hundred chase card does to a mean. It also assumes
          you could sell everything at market price, and bulk commons are close to unsellable in practice. Treat a
          box as entertainment with a partial refund, not an investment. If you want specific cards for a deck,{" "}
          <Link href="/browse" className="text-brand-400 hover:underline">buying the singles</Link> is almost
          always cheaper and always certain — and either way,{" "}
          <Link href="/sealed" className="text-brand-400 hover:underline">compare box prices</Link> before you buy.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          If you would rather feel that distribution than read about it,{" "}
          <Link href="/games/pack-sim" className="text-brand-400 hover:underline">
            open some virtual packs
          </Link>{" "}
          — same card pool, same pack structure, live prices on every pull, and no money. A dozen
          packs of mostly bulk makes the argument above far better than a paragraph does.
        </p>
      </section>
    </div>
  );
}
