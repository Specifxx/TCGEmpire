import type { Metadata } from "next";
import Link from "next/link";
import { getPreorderGroups } from "@/lib/sealed-import";
import { getCountry, getDisplayCurrency } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { affiliateUrl } from "@/lib/affiliate";
import { OutboundLink } from "@/components/OutboundLink";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { HubFaq } from "@/components/HubFaq";
import { faqPage, ldJson, webPage } from "@/lib/jsonld";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { setByCode, isPreorderSetCode } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";

// ─────────────────────────────────────────────────────────────────────────────
// /radiance-preorders — the same box, at every store, before it ships.
// ─────────────────────────────────────────────────────────────────────────────
// Pre-order pricing is the one window where the spread between stores is both
// enormous and completely unshopped: the product is identical (nobody has opened
// one), so price is the only variable, and the comparison sites that cover a set
// only start covering it on release day. Real observed spread at the time this
// was built: a Radiance Booster Box at C$149.95 from one tracked store and
// A$240.00 at another.
//
// EVERY PRICE HERE IS A PRE-ORDER, and the page says so in the heading, on each
// row and in its structured data (schema.org PreOrder, never InStock). That
// distinction is the whole reason pre-orders were historically dropped at import
// instead of listed — see the note in lib/sealed-import.ts. They are captured
// now precisely because this page can state what they are.
//
// The page is DATE-DRIVEN and self-retiring: getPreorderGroups() keys off
// isPreorderSetCode(), so at 23 Oct 2026 these listings graduate into /sealed on
// their own and this page switches to its released state pointing at live prices.
export const revalidate = 3600;

const SET_CODE = "RAD";

const FAQS = [
  {
    q: "How much does a Riftbound Radiance booster box cost to pre-order?",
    a: "Pre-order prices vary widely between stores because nothing has shipped yet and stores are setting their own opening price. This page compares every tracked store's live pre-order price in your market, cheapest first, so you can see the real spread rather than the first price you find.",
  },
  {
    q: "When does Riftbound Radiance release?",
    a: "23 October 2026. Radiance is the fifth Riftbound set, announced in Riot's product rundown on 4 August 2026, with roughly 180 cards.",
  },
  {
    q: "Is it cheaper to pre-order or to wait until release?",
    a: "It depends on the product. Sealed boxes often sit at or near RRP during pre-order and can rise at launch if demand outruns allocation, while singles are almost always cheapest a few weeks after release once supply settles. If you want to open product, pre-ordering at a good price is reasonable; if you want specific cards, waiting and buying singles is usually cheaper.",
  },
  {
    q: "Are these pre-order prices final?",
    a: "No. A pre-order price is what the store is asking today, and stores do change them before release — up or down — as allocations firm up. We refresh these daily, and nothing here is a commitment from the store or from us. Always confirm the price and the store's pre-order terms at checkout.",
  },
  {
    q: "Do you include postage in the pre-order comparison?",
    a: "The prices shown are the store's listed item price. Our per-store postage estimates are documented on each store's own page, and the Best Basket tool factors postage in when you are buying several things at once.",
  },
];

export const metadata: Metadata = {
  title: { absolute: "Riftbound Radiance Pre-Order Prices Compared — Every Store | RiftCompare" },
  description:
    "Compare Riftbound: Radiance pre-order prices across every tracked store — booster boxes, packs, the Radiance Vault, Showdown Decks and event kits, cheapest first, in your currency. Releases 23 October 2026.",
  keywords: [
    "Riftbound Radiance preorder",
    "Riftbound Radiance pre-order price",
    "Radiance booster box preorder",
    "Riftbound Radiance booster box price",
    "cheapest Riftbound Radiance preorder",
    "Riftbound Set 5 preorder",
  ],
  alternates: pageAlternates("/radiance-preorders"),
  openGraph: pageOpenGraph({
    title: "Riftbound Radiance Pre-Order Prices — Compared Across Every Store",
    description: "Booster boxes, Vaults and Showdown Decks — every tracked store's pre-order price, cheapest first.",
    url: "/radiance-preorders",
  }),
};

export default async function RadiancePreordersPage() {
  const country = getCountry();
  const info = COUNTRIES[country];
  const currency = getDisplayCurrency(country);
  const set = setByCode(SET_CODE);
  const stillUpcoming = isPreorderSetCode(SET_CODE);
  const groups = stillUpcoming ? await getPreorderGroups(country) : [];

  // Only groups with a real price are worth showing; the rest would be an empty row.
  const priced = groups
    .filter((g) => g.lowestPriceCents != null && g.listings.length > 0)
    .sort((a, b) => (a.lowestPriceCents ?? 9e9) - (b.lowestPriceCents ?? 9e9));

  const storeCount = new Set(priced.flatMap((g) => g.listings.map((l) => l.retailer))).size;

  const ld = ldJson(
    webPage({
      name: "Riftbound Radiance Pre-Order Prices",
      href: "/radiance-preorders",
      description:
        "Pre-order price comparison for Riftbound: Radiance sealed products across every tracked store, updated daily.",
      type: "CollectionPage",
    }),
    // PreOrder availability, never InStock — none of this has shipped. Emitting
    // InStock here would be a false availability signal to Google Shopping and to
    // any agent reading the page, for a product no store can post today.
    priced.length
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Riftbound Radiance pre-orders",
          url: `${SITE_URL}/radiance-preorders`,
          itemListElement: priced.slice(0, 30).map((g, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: {
              "@type": "Product",
              name: g.name,
              ...(g.imageUrl ? { image: g.imageUrl } : {}),
              offers: {
                "@type": "AggregateOffer",
                availability: "https://schema.org/PreOrder",
                priceCurrency: currency,
                lowPrice: ((g.lowestPriceCents ?? 0) / 100).toFixed(2),
                offerCount: g.listings.length,
              },
            },
          })),
        }
      : null,
    faqPage(FAQS),
  );

  return (
    <div className="mx-auto max-w-4xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
      <Breadcrumbs trail={[{ name: "Radiance pre-orders", href: "/radiance-preorders" }]} />

      <span className="chip mb-3 inline-flex bg-gold/15 text-[11px] font-bold uppercase tracking-wide text-gold">
        Pre-order · releases 23 Oct 2026
      </span>
      <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">
        Riftbound Radiance pre-order prices
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
        Nothing has shipped yet, so every store is simply picking an opening price — and they are picking very
        different ones. Below is every Radiance product our tracked {info.adjective} stores are taking pre-orders on,
        cheapest first, in {currency}. Prices refresh daily.
      </p>

      {priced.length > 0 ? (
        <>
          <p className="mt-4 text-xs text-slate-500">
            {priced.length} product{priced.length === 1 ? "" : "s"} across {storeCount} store
            {storeCount === 1 ? "" : "s"} · sorted cheapest first
          </p>

          <div className="mt-4 space-y-4">
            {priced.map((g) => {
              const rows = [...g.listings].sort((a, b) => a.priceCents - b.priceCents);
              const cheapest = rows[0];
              return (
                <section key={g.groupKey} className="card-surface overflow-hidden">
                  <div className="flex items-center justify-between gap-3 border-b border-ink-800 px-4 py-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-bold text-white">{g.name}</h2>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {rows.length} store{rows.length === 1 ? "" : "s"} taking pre-orders
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="num text-lg font-extrabold text-brand-400">
                        {formatMoney(cheapest.priceCents, currency)}
                      </div>
                      <div className="text-[11px] text-slate-500">cheapest</div>
                    </div>
                  </div>
                  <ul className="divide-y divide-ink-800">
                    {rows.map((l) => {
                      const overPct =
                        cheapest.priceCents > 0
                          ? Math.round(((l.priceCents - cheapest.priceCents) / cheapest.priceCents) * 100)
                          : 0;
                      return (
                        <li key={`${g.groupKey}-${l.retailer}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
                          <span className="min-w-0 truncate text-sm text-slate-300">{l.retailerName}</span>
                          <span className="flex shrink-0 items-center gap-3">
                            {overPct > 0 && (
                              <span className="num text-[11px] text-slate-500">+{overPct}%</span>
                            )}
                            <span className="num text-sm font-semibold text-white">
                              {formatMoney(l.priceCents, currency)}
                            </span>
                            <OutboundLink
                              href={affiliateUrl(l.url, l.retailer)}
                              retailer={l.retailer}
                              country={country}
                              kind="sealed"
                              className="btn-ghost px-2.5 py-1 text-xs"
                            >
                              Pre-order
                            </OutboundLink>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>

          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Every price above is a <strong className="text-slate-300">pre-order</strong> — the store is taking payment
            or a deposit now for stock that arrives on or after 23 October 2026. Pre-order prices move before release,
            and store terms differ, so confirm both at checkout.
          </p>
          {/* Store links here are affiliate-tagged (affiliateUrl), so the page
              carries its own disclosure. AffiliateDisclosure only speaks for
              eBay/TCGplayer, so the wording is stated directly instead. */}
          <p className="mt-2 text-[11px] leading-snug text-slate-400">
            Some store links on this page are affiliate links. If you pre-order through one we may earn a commission,
            at no extra cost to you. It never affects the ranking above — these are sorted purely by price.
          </p>
        </>
      ) : (
        <div className="card-surface mt-5 p-6">
          <h2 className="font-bold text-white">
            {stillUpcoming ? "No Radiance pre-orders tracked yet" : "Radiance is out — see live prices"}
          </h2>
          {stillUpcoming ? (
            <>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
                We list pre-orders as our tracked stores publish them, and none have appeared in your market&apos;s feed
                yet. This page fills in on its own as they do — nothing here is ever an estimate or a placeholder
                price.
              </p>
              <p className="mt-3 text-sm text-slate-400">
                In the meantime:{" "}
                <Link href="/radiance-countdown" className="text-brand-400 hover:underline">
                  what&apos;s confirmed about Radiance
                </Link>{" "}
                ·{" "}
                <Link href="/sealed" className="text-brand-400 hover:underline">
                  sealed products you can buy today
                </Link>
              </p>
            </>
          ) : (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
              Radiance has released, so its products are priced alongside every other set —{" "}
              <Link href="/sealed" className="text-brand-400 hover:underline">
                see live sealed prices
              </Link>{" "}
              or{" "}
              <Link href={`/sets/${set?.slug ?? "radiance"}`} className="text-brand-400 hover:underline">
                browse every Radiance card
              </Link>
              .
            </p>
          )}
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-2 text-sm">
        <Link href="/radiance-countdown" className="btn-ghost">Radiance release date</Link>
        <Link href="/sealed" className="btn-ghost">All sealed prices</Link>
        <Link href="/tools/box-ev" className="btn-ghost">Is a box worth opening?</Link>
      </div>

      <HubFaq faqs={FAQS} />
    </div>
  );
}
