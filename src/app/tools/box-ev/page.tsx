import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { SETS } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";
import { BoxEvCalculator, type SetRarityData } from "@/components/BoxEvCalculator";
import { AdSlot } from "@/components/AdSlot";

export const revalidate = 86400;

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

  // Store-only lowest price per card for the viewer's market. We EXCLUDE eBay
  // (retailer keys "ebay"/"ebay_us"/"ebay_uk") on purpose: an eBay single-card
  // listing carries a structural shipping + minimum-viable-listing floor of
  // roughly $3–5 that has nothing to do with a bulk card's real value. Because
  // most commons/uncommons have an eBay listing, that floor was systematically
  // inflating every rarity's average (and so every box's EV). The cheapest
  // tracked STORE listing reflects what bulk actually changes hands for; cards
  // with no store listing are genuine bulk and count as $0.
  const storeLows = await prisma.retailerPrice
    .groupBy({
      by: ["cardId"],
      where: { inStock: true, country, NOT: { retailer: { startsWith: "ebay" } } },
      _min: { priceCents: true },
    })
    .catch(() => [] as { cardId: string; _min: { priceCents: number | null } }[]);
  const lowByCard = new Map<string, number>();
  for (const r of storeLows) if (r._min.priceCents != null) lowByCard.set(r.cardId, r._min.priceCents);

  const cards = await prisma.card
    .findMany({
      where: { variant: null, isPromo: false },
      select: { id: true, setCode: true, rarity: true, collectorNumber: true },
    })
    .catch(() => []);

  // EXCLUDE special chase prints from the base-rarity pools. Cloned alt-art prints
  // already carry variant != null (filtered above), but native over-number/secret
  // and SIGNATURE cards come straight from the feed with variant = null and a real
  // rarity (usually Showcase/Epic) — e.g. "223s/221" (signature) or "300/298"
  // (numbered above the set's base size). Averaging those expensive 1-in-72 to
  // 1-in-720 chase cards into the base Epic/Showcase pull was inflating EV. A base
  // pack pull of rarity R should be a base card of R, so leave the chase tier out.
  const isSpecialPrint = (collectorNumber: string): boolean => {
    const [numPart, denomPart] = collectorNumber.split("/");
    if (!numPart) return false;
    if (/[a-z]/i.test(numPart.trim())) return true; // signature/alt-art suffix, e.g. 223s, 112a
    const num = parseInt(numPart, 10);
    const denom = parseInt((denomPart ?? "").trim(), 10);
    return Number.isFinite(num) && Number.isFinite(denom) && denom > 0 && num > denom; // over-number/secret
  };

  // Average value of a RANDOM card of each rarity — the honest input to EV.
  //  • divide by EVERY card of the rarity, not just priced ones (unpriced bulk = $0);
  //  • cap each card so one mis-/over-priced listing can't define a rarity. Epic and
  //    Showcase have FEW cards, so a single bad listing skews the whole mean — and a
  //    median-anchored cap doesn't help when n is tiny (with n=2 the median IS the
  //    outlier's average). So for small samples we anchor the cap on the MINIMUM
  //    priced value (which a high outlier can't move); larger samples use the median
  //    so legitimate price spread is preserved.
  const median = (s: number[]): number => {
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  // Robust sum of per-card values for one rarity (values already collected).
  const robustSum = (values: number[]): number => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const cap = sorted.length < 6 ? sorted[0] * 4 : median(sorted) * 4;
    return sorted.reduce((a, v) => a + Math.min(v, cap), 0);
  };
  const agg = new Map<string, Map<string, { values: number[]; total: number }>>();
  for (const c of cards) {
    if (isSpecialPrint(c.collectorNumber)) continue; // chase tier, not a base pull
    const bySet = agg.get(c.setCode) ?? agg.set(c.setCode, new Map()).get(c.setCode)!;
    const cell = bySet.get(c.rarity) ?? { values: [], total: 0 };
    cell.total += 1;
    const p = lowByCard.get(c.id);
    if (p != null) cell.values.push(p);
    bySet.set(c.rarity, cell);
  }
  const sets: SetRarityData[] = SETS.filter((s) => !s.comingSoon && agg.has(s.code)).map((s) => ({
    setCode: s.code,
    setName: s.name,
    rarities: Object.fromEntries(
      [...(agg.get(s.code) ?? new Map<string, { values: number[]; total: number }>())].map(([rarity, { values, total }]) => [
        rarity,
        { avgCents: total > 0 ? Math.round(robustSum(values) / total) : 0, priced: values.length, total },
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
  const appLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Riftbound Booster Box EV Calculator",
    url: `${SITE_URL}/tools/box-ev`,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: info.currency },
    description:
      "Free Riftbound booster box expected-value calculator: tune pull rates and see whether opening beats buying singles, from live prices.",
  };

  return (
    <div className="mx-auto max-w-3xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbLd, appLd]) }} />

      <div className="mb-5">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <span className="text-slate-300">Box EV Calculator</span>
        </nav>
        <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">Booster Box EV Calculator</h1>
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

      <AdSlot className="mt-6" height={100} />

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
