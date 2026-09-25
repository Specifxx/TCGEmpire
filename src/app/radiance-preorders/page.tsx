import type { Metadata } from "next";
import Link from "next/link";
import { getPreorderGroups } from "@/lib/sealed-import";
import { getCountry, getDisplayCurrency } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { HubFaq } from "@/components/HubFaq";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { PreorderPriceTable, pricedPreorderGroups, preorderTableGroups } from "@/components/PreorderPriceTable";
import { faqPage, ldJson, webPage } from "@/lib/jsonld";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { setByCode, isPreorderSetCode } from "@/lib/constants";
import { isBeforeRadianceRelease, RADIANCE_PRODUCTS, RADIANCE_MERCH_DRAW } from "@/lib/sets/radiance";
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

// "25 September" — the draw's dates are stored once, as ISO, in lib/sets/radiance.ts.
function dayMonth(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}

const FAQS = [
  {
    q: "How much does a Riftbound Radiance booster box cost to pre-order?",
    a: "Pre-order prices vary widely between stores because nothing has shipped yet and stores are setting their own opening price. This page compares every tracked store's live pre-order price in your market, cheapest first, so you can see the real spread rather than the first price you find.",
  },
  {
    q: "When does Riftbound Radiance release?",
    a: "23 October 2026. Radiance is the fifth Riftbound set, announced in Riot's product rundown on 4 August 2026. Riot's announcement said 180 cards, 66 of them Showcase treatments; the first Radiance card to surface is printed \"167/167\", so the base numbered run is 167 with the Showcase printings numbered above it.",
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
  {
    q: "What is the difference between the Radiance Vault and the Vault Bundle?",
    a: "There is none — they are the same product. Riot and the distributor call it the Vault Bundle; many stores list it as the \"Radiance Vault\". It holds six booster packs, 36 runes, three foil promo tokens, a storage box and two dividers, at a US$34.99 distributor MSRP, and this page lists every store's copy under one heading.",
  },
  {
    q: "Can I pre-order Radiance from Riot directly?",
    a: `Not as a pre-order. Riot's Merch Store runs a draw instead: sign-ups from ${dayMonth(RADIANCE_MERCH_DRAW.signupOpens)} to ${dayMonth(RADIANCE_MERCH_DRAW.signupCloses)} 2026, ${RADIANCE_MERCH_DRAW.regions} only, with ${RADIANCE_MERCH_DRAW.limit}. Entrants are picked from about ${dayMonth(RADIANCE_MERCH_DRAW.selectionFrom)}; everyone else buys from a store or a marketplace.`,
  },
  {
    q: "Why are TCGplayer's Radiance prices so much higher than MSRP?",
    a: "TCGplayer is a marketplace: before release its Radiance prices are individual sellers' asking prices for stock they expect to receive, not a store's pre-order at list price. We show the cheapest English listing, which is often well above the US$120 display MSRP, so a store pre-order is usually the cheaper route before release day.",
  },
];

export const metadata: Metadata = {
  // "BOOSTER BOX" IN THE TITLE (2026-09-25). docs/seo-keyword-map.md gives this
  // page `radiance booster box price`, it ranks 13.8 for it, and the phrase was
  // in neither the 72-character title nor the 204-character description —
  // both past Google's truncation. No price in the title: the page renders in
  // the visitor's currency, so an AU or UK searcher would see a US$ figure the
  // page then does not show. No store count (tests/no-store-count-in-titles).
  title: { absolute: "Riftbound Radiance Booster Box Pre-Order Prices" },
  description:
    "Radiance booster box, Vault Bundle and pack pre-order prices from every tracked store, in your currency, refreshed daily. Out 23 October 2026.",
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
    description: "Booster boxes, Vault Bundles and Showdown Decks — every tracked store's pre-order price, cheapest first.",
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
  // `priced` (an open offer exists) feeds the structured data; `listed` (any
  // offer at all) feeds the visible table, which shows sold-out stores too.
  const priced = pricedPreorderGroups(groups);
  const listed = preorderTableGroups(groups);

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
                // Stores with an OPEN offer — a sold-out listing is not an offer.
                offerCount: g.storeCount,
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

      {/* lnum only, no tnum: body's tabular figures also widen Inter's hyphen,
          which rendered this label as 'PRE -ORDER' (globals.css prose rule). */}
      <span className="chip mb-3 inline-flex bg-gold/15 text-[11px] font-bold uppercase tracking-wide text-gold [font-feature-settings:'lnum'_1]">
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

      {listed.length > 0 ? (
        <div className="mt-4">
          {/* PreorderPriceTable's own product headings are <h3> (it also renders
              inside RadianceHub's "Products & preorders" <h2>), so this page needs
              its own enclosing <h2> or h1 -> h3 skips a level. */}
          <h2 className="sr-only">Radiance pre-order prices by product</h2>
          <PreorderPriceTable groups={listed} country={country} currency={currency} />
        </div>
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
                <Link href="/release-dates" className="text-brand-400 hover:underline">
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

      {/* Launch capture, right under the prices (2026-09-23). A visitor who is
          not ready to order today, or whose market has no pre-orders tracked
          yet, otherwise leaves with no way back on release day; this puts them
          on the list the release-day email (lib/release-day.ts) goes to. Same
          gate and copy as the hub and the radiance-tagged articles. */}
      {isBeforeRadianceRelease() && (
        <div id="notify" className="mt-6 max-w-lg scroll-mt-header">
          <NewsletterSignup
            siteName="RiftCompare"
            variant="card"
            source="radiance-launch"
            trackEvent="radiance_notify_click"
            heading="Get an email the day Radiance prices go live"
            cta="Notify me"
            done="You're on the list. We'll email you on release day."
          />
        </div>
      )}

      {/* WHAT each product is (2026-09-24). Stores list the same thing under
          different names ("Radiance Vault" vs "Vault Bundle"), and a first-time
          buyer comparing a display with a bundle needs to know what is in each
          box before the price means anything. Contents and US MSRPs are
          lib/sets/radiance.ts's, the hub's single source — never typed here. */}
      <section className="card-surface mt-8 p-6">
        <h2 className="text-xl font-extrabold text-white">What each Radiance product is</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          Contents are from the retailer sheet; list prices are the US distributor MSRP. Riot has not published a price
          and no MSRP outside the US has been announced — the prices above are what stores are actually asking.
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {RADIANCE_PRODUCTS.map((p) => (
            <div key={p.name} className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
              <dt className="font-bold text-white">{p.name}</dt>
              {p.msrp && <dd className="mt-0.5 text-xs font-semibold text-gold">US MSRP {p.msrp}</dd>}
              {p.detail && <dd className="mt-1.5 text-sm leading-relaxed text-slate-400">{p.detail}.</dd>}
            </div>
          ))}
        </dl>
      </section>

      {/* Riot's Merch Store DRAW. People search for a Riot-store pre-order and
          there is none — say what there is, with its dates. */}
      {stillUpcoming && (
        <section className="card-surface mt-6 p-6">
          <h2 className="text-xl font-extrabold text-white">Buying from Riot: the Merch Store draw</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
            Riot is not taking Radiance pre-orders. Its Merch Store runs a draw for{" "}
            <strong className="text-slate-200">{RADIANCE_MERCH_DRAW.regions}</strong> only: sign-ups open{" "}
            <strong className="text-slate-200">{dayMonth(RADIANCE_MERCH_DRAW.signupOpens)}</strong> and close{" "}
            <strong className="text-slate-200">{dayMonth(RADIANCE_MERCH_DRAW.signupCloses)}</strong> (9:00 AM Pacific, 16:00 UTC),
            selected entrants hear from about {dayMonth(RADIANCE_MERCH_DRAW.selectionFrom)}, and each may buy{" "}
            {RADIANCE_MERCH_DRAW.limit}, shipping from release day. An entry is not an order, so if you want a display
            for certain, a store pre-order is the dependable route.
          </p>
        </section>
      )}

      {/* WHEN to pre-order, not just what it costs. The prices above answer
          "which store is cheapest today"; this answers the question a buyer
          actually arrives with, and it is the half no comparison page carries.
          Every claim here is a mechanism or a dated fact from Riot's own
          schedule — no price prediction, and deliberately no "buy now" nudge on
          a page that earns affiliate commission when you do. */}
      {stillUpcoming && (
        <section className="card-surface mt-8 p-6">
          <h2 className="text-xl font-extrabold text-white">When to pre-order Radiance — and when to wait</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
            Two dates change these prices before release day. <strong className="text-slate-200">Preview Season runs
            25 September to 9 October 2026</strong> (it opens at the Regional Qualifier: Los Angeles), when the cards
            are revealed a handful at a time; a store that
            priced its boxes before anyone knew what was in the set often re-prices once the chase cards are known.
            Then <strong className="text-slate-200">Pre-Rift events run 16–22 October</strong>, a week ahead of the
            23 October street date, which is when the first singles start changing hands and when sealed stock is at
            its tightest.
          </p>
          {/* Prose, not a numeric column: lnum only, like the globals.css prose
              rule (which leaves plain li alone), so 'Pre-ordering' has no gap. */}
          <ul className="mt-4 grid gap-2 text-sm leading-relaxed text-slate-400 [font-feature-settings:'lnum'_1]">
            <li>
              <strong className="text-slate-200">Want to open product?</strong> Pre-ordering is reasonable, because
              allocation — not price — is what runs out. The spread between the cheapest and dearest tracked store
              above is the whole argument for comparing first: it is the same box either way, since nobody has opened
              one.
            </li>
            <li>
              <strong className="text-slate-200">Want specific cards?</strong> Waiting is usually cheaper. Singles are
              at their most volatile during Pre-Rift week — supply is a handful of event boxes against everyone who
              wants to build immediately — and they typically settle a few weeks after release once supply catches up.
              Vendetta&apos;s singles started trading several days ahead of its official street date for exactly this
              reason.
            </li>
            <li>
              <strong className="text-slate-200">Not sure it is worth opening at all?</strong> That is an arithmetic
              question, and it needs real singles prices to answer, which do not exist for an unreleased set. The{" "}
              <Link href="/tools/box-ev" className="text-brand-300 underline-offset-2 hover:underline">box EV
              calculator</Link> answers it for every set that has released, and will cover Radiance from 23 October.
            </li>
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            We do not forecast prices here and we will not tell you the number is going up. What this page can tell
            you is what every tracked store is charging right now, in your currency, refreshed daily
            {/* Not "a price alert will email you if one drops" (the copy until
                2026-09-25): PriceAlert.cardId is required, so no sealed
                product can be watched. The release-day email above is real. */}
            {isBeforeRadianceRelease() ? (
              <>
                , and{" "}
                <a href="#notify" className="text-brand-300 underline-offset-2 hover:underline">we&apos;ll email you</a>{" "}
                the day Radiance prices go live. Revealed cards can be watched one by one from{" "}
                <Link href="/sets/radiance" className="text-brand-300 underline-offset-2 hover:underline">the Radiance
                card list</Link>.
              </>
            ) : (
              "."
            )}
          </p>
        </section>
      )}

      <div className="mt-8 flex flex-wrap gap-2 text-sm">
        <Link href="/blog/where-to-buy-riftbound-radiance" className="btn-ghost">Where to buy Radiance</Link>
        <Link href="/blog/riftbound-radiance-spoilers" className="btn-ghost">Radiance spoilers so far</Link>
        <Link href="/release-dates" className="btn-ghost">Riftbound release dates</Link>
        <Link href="/blog/riftbound-radiance-what-we-know" className="btn-ghost">What&apos;s confirmed about Radiance</Link>
        <Link href="/sealed" className="btn-ghost">All sealed prices</Link>
        <Link href="/tools/box-ev" className="btn-ghost">Is a box worth opening?</Link>
      </div>

      <HubFaq faqs={FAQS} />
    </div>
  );
}
