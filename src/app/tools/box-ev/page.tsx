import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES, pickPrice } from "@/lib/country";
import { SETS } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";
import { BoxEvCalculator, type SetRarityData } from "@/components/BoxEvCalculator";
import { AdSlot } from "@/components/AdSlot";
import { ADSENSE_SLOTS } from "@/lib/ads";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: { absolute: "Riftbound Booster Box EV Calculator — Is a Box Worth Opening? | RiftCompare" },
  description:
    "Work out the expected value of a Riftbound booster box from LIVE singles prices: pick a set, tune the pull rates, and see whether opening beats buying singles. Free box EV calculator updated daily.",
  keywords: [
    "Riftbound box EV",
    "Riftbound booster box value",
    "is a Riftbound booster box worth it",
    "Riftbound expected value",
    "TCG box EV calculator",
  ],
  alternates: { canonical: "/tools/box-ev" },
  openGraph: {
    title: "Riftbound Booster Box EV Calculator",
    description: "Expected value per box from live singles prices — is opening worth it?",
    url: `${SITE_URL}/tools/box-ev`,
  },
};

export default async function BoxEvPage() {
  const country = getCountry();
  const info = COUNTRIES[country];

  // Live average price per (set, rarity) for the viewer's market — base prints
  // only (boxes contain base prints; alt-art/promo pricing would skew the mean).
  const cards = await prisma.card.findMany({
    where: { variant: null, isPromo: false },
    select: {
      setCode: true, rarity: true,
      lowestPriceCents: true, lowestPriceCentsNz: true, lowestPriceCentsUs: true, lowestPriceCentsUk: true,
    },
  }).catch(() => []);

  // Average value of a RANDOM card of each rarity — the honest input to EV. The
  // key fix vs. the naive version: divide by EVERY card of that rarity, not just
  // the ones that currently have a listing. Most commons/uncommons are bulk with
  // no live price; counting only priced cards made each slot worth the average of
  // the *valuable* cards and massively overstated every box. Unpriced bulk counts
  // as ~$0 — which is what a random bulk pull is actually worth.
  const agg = new Map<string, Map<string, { sum: number; priced: number; total: number }>>();
  for (const c of cards) {
    const bySet = agg.get(c.setCode) ?? agg.set(c.setCode, new Map()).get(c.setCode)!;
    const cell = bySet.get(c.rarity) ?? { sum: 0, priced: 0, total: 0 };
    cell.total += 1;
    const p = pickPrice(c, country);
    if (p != null) {
      cell.sum += p;
      cell.priced += 1;
    }
    bySet.set(c.rarity, cell);
  }
  const sets: SetRarityData[] = SETS.filter((s) => !s.comingSoon && agg.has(s.code)).map((s) => ({
    setCode: s.code,
    setName: s.name,
    rarities: Object.fromEntries(
      [...(agg.get(s.code) ?? new Map())].map(([rarity, { sum, priced, total }]) => [
        rarity,
        { avgCents: total > 0 ? Math.round(sum / total) : 0, priced, total },
      ])
    ),
  }));

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Box EV Calculator", item: `${SITE_URL}/tools/box-ev` },
    ],
  };

  return (
    <div className="mx-auto max-w-3xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <div className="mb-5">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <span className="text-slate-300">Box EV Calculator</span>
        </nav>
        <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">📦 Booster Box EV Calculator</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          Is a Riftbound booster box worth opening? We feed in the <strong className="text-slate-200">live average
          singles price of every rarity</strong> in {info.place} (updated daily) — you tune the pull rates to your
          box's printed breakdown, and the maths does the rest.
        </p>
      </div>

      {sets.length === 0 ? (
        <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
          Price data is still warming up — check back shortly.
        </div>
      ) : (
        <BoxEvCalculator sets={sets} currency={info.currency} />
      )}

      <AdSlot slot={ADSENSE_SLOTS.content} className="mt-6" height={100} />

      <section className="card-surface mt-6 p-5">
        <h2 className="font-bold text-white">How this works (and what EV can't tell you)</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Expected value multiplies each rarity's average live price by how many of that rarity a
          pack yields, then sums across the box. It's an average over many boxes — a single box can
          smash it or whiff completely. EV also values every card at its market price, but bulk
          commons are hard to actually sell. Rule of thumb: open boxes for fun and the chase,{" "}
          <Link href="/browse" className="text-brand-400 hover:underline">buy singles</Link> for your deck, and{" "}
          <Link href="/sealed" className="text-brand-400 hover:underline">compare box prices</Link> either way.
        </p>
      </section>
    </div>
  );
}
