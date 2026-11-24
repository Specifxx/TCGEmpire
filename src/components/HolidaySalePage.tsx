import { InlineSignupPrompt } from "@/components/InlineSignupPrompt";
import type { Metadata } from "next";
import Link from "next/link";
import { getSealedGroups } from "@/lib/sealed-import";
import { withLiveStock } from "@/lib/preorder-live-stock";
import { getCountry, getDisplayCurrency } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { HubFaq } from "@/components/HubFaq";
import { PreorderPriceTable } from "@/components/PreorderPriceTable";
import { EbaySearchPanel } from "@/components/EbaySearchPanel";
import { formatMoney } from "@/lib/format";
import { affiliateUrl, ebayLabel, ebaySealedQuery, ebaySearchUrl } from "@/lib/affiliate";
import { faqPage, ldJson, webPage } from "@/lib/jsonld";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { blackFriday, cyberMonday, sealedDeals, UNDER_MEDIAN_PCT, UNDER_MSRP_PCT } from "@/lib/black-friday";
import { FamilyDeals } from "@/components/FamilyDeals";
import { SalePriceWatch } from "@/components/SalePriceWatch";
import { SaleDeals } from "@/components/SaleDeals";
import { SaleNav } from "@/components/SaleNav";
import { TELEGRAM_URL } from "@/components/DiscordCta";
import { saleDealRows } from "@/lib/sale-deals-data";
import { DISCORD_URL } from "@/lib/site";
import { TcgplayerSaleBlock } from "@/components/TcgplayerSaleBlock";
import { TcgplayerCyberBanner } from "@/components/TcgplayerCyberBanner";

// ─────────────────────────────────────────────────────────────────────────────
// The Black Friday and Cyber Monday pages, /black-friday and /cyber-monday.
// ─────────────────────────────────────────────────────────────────────────────
// /black-friday was built 2026-10-30 by the weekly growth review (DECISIONS.md,
// "A Black Friday deals page on RiftCompare"); /cyber-monday joined it on
// 2026-11-06 ("Black Friday and Cyber Monday price watch pages"), the same page
// with its own URL, title and FAQ, so each sale day has a page Google can rank
// for its own query. One URL each, kept all year, so it gathers links and
// history before each season. What both list: lib/black-friday.ts sealedDeals,
// in-stock sealed products whose cheapest store is well under the other stores
// or the MSRP, today; then the price watch (components/PriceWatch.tsx): sealed
// boxes, the week's biggest price drops, graded cards and chase auctions, each
// ending in a live eBay listing. Never a "was" price or a deadline.
//
// The route files set `revalidate = 21600`, the floor for pages buyers act on
// (CLAUDE.md, 2026-10-14). The page reads getCountry() (cookies), so it renders
// per request anyway; a visitor without a market cookie (and every crawler)
// gets the US, the market that earns (DEFAULT_COUNTRY).

const SHOWN = 12;

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function season(): { year: number; bf: string; cm: string } {
  const now = new Date();
  let year = now.getUTCFullYear();
  if (now.toISOString().slice(0, 10) > cyberMonday(year)) year += 1;
  return { year, bf: blackFriday(year), cm: cyberMonday(year) };
}

function faqs(bf: string, cm: string, event: SaleEvent) {
  return [
    {
      q: event === "black-friday" ? "Will Riftbound be cheaper on Black Friday?" : "Will Riftbound be cheaper on Cyber Monday?",
      a: `Some stores discount sealed product for Black Friday (${longDate(bf)}) and Cyber Monday (${longDate(cm)}), but many Riftbound booster boxes already sell at or under the US$120 MSRP at the cheapest stores. Compare any Black Friday price with the live lowest price here rather than with the MSRP or a crossed-out "was" price.`,
    },
    {
      q: "How does this page pick a deal?",
      a: `A product is listed when its cheapest in-stock store price is at least ${UNDER_MEDIAN_PCT}% under the median of the stores that have it in stock (with at least three stores), or at least ${UNDER_MSRP_PCT}% under its US MSRP. Biggest saving first. eBay sellers are never counted as a store or a deal.`,
    },
    {
      q: "How often are the prices updated?",
      a: "Store prices are re-read every day, and a store that was sold out at our last check is left out. Black Friday sales start and end at each store's own time, so confirm the price at checkout.",
    },
    {
      q: "What is the price watch?",
      a: "Four lists for the high-value end of the market, each row ending in a live eBay listing: in-stock sealed boxes with the cheapest store beside the cheapest eBay copy, the week's biggest price drops, the dearest graded slab live for each card, and the biggest auction bids closing within 24 hours. Asking prices at our last check, never sales; an eBay seller is never counted as a store or a deal.",
    },
    {
      q: "Does the price include postage?",
      a: "No. Prices are the store's listed item price. A booster box ships as a parcel, so check the store's checkout for postage before you compare two close prices.",
    },
  ];
}

export type SaleEvent = "black-friday" | "cyber-monday";
const PATHS: Record<SaleEvent, "/black-friday" | "/cyber-monday"> = { "black-friday": "/black-friday", "cyber-monday": "/cyber-monday" };
const NAMES: Record<SaleEvent, string> = { "black-friday": "Black Friday", "cyber-monday": "Cyber Monday" };

export function holidayMetadata(event: SaleEvent): Metadata {
  const { year } = season();
  const PATH = PATHS[event];
  const name = NAMES[event];
  return {
    title: { absolute: `Riftbound ${name} Deals ${year}: Sealed Prices` },
    description:
      event === "black-friday"
        ? `Riftbound booster boxes and sealed product under the other stores or the MSRP today, in your currency, checked daily through Black Friday and Cyber Monday ${year}. Plus a price watch: sealed boxes, the week's biggest price drops, graded cards and chase auctions, each with a live eBay listing.`
        : `Riftbound Cyber Monday ${year}: sealed product under the other stores or the MSRP today, in your currency, checked daily through the weekend, with a price watch of sealed boxes, the week's biggest price drops, graded cards and chase auctions, each linking to a live eBay listing.`,
    keywords:
      event === "black-friday"
        ? ["Riftbound Black Friday", "Riftbound Black Friday deals", "Riftbound booster box Black Friday", "Riftbound Cyber Monday", "Riftbound sale"]
        : ["Riftbound Cyber Monday", "Riftbound Cyber Monday deals", "Riftbound booster box Cyber Monday", "Riftbound Cyber Week", "Riftbound sale"],
    alternates: pageAlternates(PATH),
    openGraph: pageOpenGraph({
      title: `Riftbound ${name} Deals ${year}`,
      description: "Sealed Riftbound products under the other stores or the MSRP, checked daily, with a live eBay price watch.",
      url: PATH,
    }),
  };
}

export async function HolidaySalePage({ event }: { event: SaleEvent }) {
  const PATH = PATHS[event];
  const name = NAMES[event];
  const source = event;
  const country = getCountry();
  const info = COUNTRIES[country];
  const currency = getDisplayCurrency(country);
  const { year, bf, cm } = season();
  // Caches itself; never wrap it in another cache (CLAUDE.md).
  const groups = await getSealedGroups(country).catch(() => []);
  // The snapshot's stock is up to a day old, and a deal is usually a store's last
  // few boxes: Eternal Magic's A$350 Origins box led this page for AU after it
  // sold out (owner, 2026-11-01). The likely deals' open offers are re-checked at
  // the store (Shopify's own `available`, held six hours, one-way: it can only
  // close an offer), then the deals are picked again from what is still open.
  const candidates = sealedDeals(groups).slice(0, SHOWN * 2).map((d) => d.group);
  const checked = await withLiveStock(candidates).catch(() => candidates);
  const deals = sealedDeals(checked);
  // ONE deal list (owner's review, 2026-11-24): the 30-day drops and the deals under the other stores or the MSRP merged, one
  // price per row (lib/sale-deals*.ts, components/SaleDeals.tsx).
  const rows = saleDealRows(groups, deals, country, PATH, source);
  const best = Math.max(0, ...rows.map((r) => Math.max(r.typical?.pct ?? 0, r.median?.pct ?? 0, r.msrp?.pct ?? 0)));
  const ebay = ebayLabel(country);
  const qa = faqs(bf, cm, event);

  const ld = ldJson(
    webPage({
      name: `Riftbound ${name} deals ${year}`,
      href: PATH,
      description: "Riftbound sealed products under the other stores or the MSRP today, checked daily, with a live eBay price watch.",
      type: "CollectionPage",
    }),
    faqPage(qa),
  );

  return (
    <div className="mx-auto max-w-4xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
      <Breadcrumbs trail={[{ name: `${name} deals`, href: PATH }]} />

      <header className="mt-2">
        <span className="chip mb-2 inline-flex bg-gold/15 text-[11px] font-bold uppercase tracking-wide text-gold [font-feature-settings:'lnum'_1]">
          Black Friday {longDate(bf)} · Cyber Monday {longDate(cm)}
        </span>
        <h1 className="font-display text-2xl font-extrabold text-white sm:text-4xl">Riftbound {name} deals</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          {rows.length ? `${rows.length} deals in ${info.adjective} stores today, up to ${best}% off` : `Sealed Riftbound in ${info.adjective} stores`}, in {currency}, re-read every day.{" "}
          <a href="#how-we-calculate" className="text-brand-400 hover:underline">How we calculate</a>
        </p>
        <p className="mt-1 text-xs text-slate-500">Store buttons and eBay links are paid links: we may earn a commission, at no cost to you.</p>
      </header>

      <div className="mt-4">
        <SaleNav
          page={event}
          items={[
            { id: "deals", label: "Deals" },
            { id: "price-watch", label: "Price watch" },
            { id: "tcgplayer-sale", label: "TCGplayer sale" },
            { id: "how-we-calculate", label: "How we calculate" },
            { id: "faq", label: "Questions" },
          ]}
        />
      </div>

      <section id="deals" aria-labelledby="deals-h" className="mt-4 scroll-mt-header">
        <h2 id="deals-h" className="sr-only">Riftbound {name} deals</h2>
        {rows.length ? (
          <SaleDeals rows={rows} country={country} currency={currency} page={PATH} discordHref={DISCORD_URL || null} telegramHref={TELEGRAM_URL} />
        ) : (
          <div className="card-surface p-6">
            <p className="font-bold text-white">No standout sealed deals in your market today</p>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
              No tracked store is far enough under its own 30-day price, the other stores or the MSRP right now. This page fills in on its own as stores cut prices.
              Meanwhile every sealed product is on the <Link href="/sealed" className="text-brand-400 hover:underline">sealed price comparison</Link>.
            </p>
          </div>
        )}
      </section>

      {/* Cyber Weekend capture (owned audience, 2026-11-21): a free account's price alert emails the drop. */}
      <InlineSignupPrompt
        className="mt-6"
        surface="inline_black_friday"
        title="Get an email when a price here drops further"
        body="A free account lets you set a price alert, and we email you when the price drops, over Black Friday and after. Alerts only, and every email has a stop link."
      />

      {/* "Also on eBay": under the comparison, never in it (2026-09-26 rule). */}
      <EbaySearchPanel
        heading="Also on eBay"
        sub={`Searches of ${ebay}. eBay sellers set their own prices; compare them with the stores above.`}
        country={country}
        pageType={event.replace(/-/g, "_")}
        className="mt-6"
        links={[
          { label: `Search ${ebay} for Riftbound booster boxes`, href: ebaySearchUrl(country, ebaySealedQuery("Booster Box", "Booster Box"), `${source}-box`) },
          { label: `Search ${ebay} for Riftbound sealed bundles`, href: ebaySearchUrl(country, "Riftbound (bundle,champion deck,starter)", `${source}-bundle`) },
        ]}
      />

      {/* The price watch (2026-11-06): sealed boxes, price drops, graded slabs and chase auctions, each ending in a live eBay listing. */}
      <SalePriceWatch country={country} currency={currency} pageType={event.replace(/-/g, "_")} source={source} />

      <div id="tcgplayer-sale" className="scroll-mt-header">
      <TcgplayerCyberBanner
        href={affiliateUrl("https://www.tcgplayer.com/search/riftbound-league-of-legends-trading-card-game/product?ProductTypeName=Sealed+Products", "tcgplayer", PATH)}
        at={Date.now()}
        pageType={event.replace(/-/g, "_")}
        className="mt-8"
      />
      <TcgplayerSaleBlock name={event === "black-friday" ? "Black Friday" : "Cyber Monday"} country={country} pageType={event.replace(/-/g, "_")} path={PATH} />
      </div>

      <section id="how-we-calculate" className="card-surface mt-8 scroll-mt-header p-4 text-sm leading-relaxed text-slate-300">
        <h2 className="font-display text-lg font-bold text-white">How we calculate</h2>
        <p className="mt-2">
          Each deal row is the cheapest open store listing in your market (never eBay; the likely deals are re-checked at the store every few hours), and every
          saving is measured against that one price. &ldquo;Biggest price drops&rdquo; compares it with the product&rsquo;s own 30-day typical price: the median of
          its cheapest in-stock price on each of the last 30 days we recorded (two weeks of records at least; a day far under the rest is left out as a wrong
          listing). &ldquo;Under other stores today&rdquo; is at least {UNDER_MEDIAN_PCT}% under the median of three or more stores; &ldquo;Under MSRP&rdquo; at
          least {UNDER_MSRP_PCT}% under its MSRP. No &ldquo;was&rdquo; prices: only what stores ask now.
        </p>
        <p className="mt-2">A row whose store we last read more than 12 hours ago says so. Prices exclude postage; check the store&rsquo;s checkout before you compare two close prices.</p>
      </section>

      <div className="mt-8 flex flex-wrap gap-2 text-sm">
        <Link href="/sealed" className="btn-ghost">All sealed prices</Link>
        <Link href="/blog/riftbound-gift-guide-2026" className="btn-ghost">Gift guide and Black Friday tips</Link>
        <Link href={event === "black-friday" ? "/cyber-monday" : "/black-friday"} className="btn-ghost">{event === "black-friday" ? "Cyber Monday deals" : "Black Friday deals"}</Link>
        <Link href="/graded" className="btn-ghost">Graded prices</Link>
        <Link href="/auctions" className="btn-ghost">Auctions</Link>
        <Link href="/sets/radiance" className="btn-ghost">Radiance prices</Link>
        <Link href="/legacy-preorders" className="btn-ghost">Legacy pre-orders</Link>
        <Link href="/release-dates" className="btn-ghost">Release dates</Link>
      </div>

      <FamilyDeals kind="deal" country={country} />

      <div id="faq" className="scroll-mt-header">
        <HubFaq faqs={qa} />
      </div>
    </div>
  );
}
