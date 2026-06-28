import type { Metadata } from "next";
import Link from "next/link";
import { getSealedGroups } from "@/lib/sealed-import";
import { formatMoney } from "@/lib/format";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { affiliateUrl, ebayAffiliateUrl } from "@/lib/affiliate";
import { OutboundLink } from "@/components/OutboundLink";
import { Reveal } from "@/components/Reveal";

export const revalidate = 900;

// Marketplace hosts per site market (NZ has no local eBay/Amazon — the AU sites
// are the closest and ship there).
const MARKETPLACE_HOSTS: Record<string, { ebay: string; amazon: string }> = {
  AU: { ebay: "ebay.com.au", amazon: "amazon.com.au" },
  NZ: { ebay: "ebay.com.au", amazon: "amazon.com.au" },
  US: { ebay: "ebay.com", amazon: "amazon.com" },
  UK: { ebay: "ebay.co.uk", amazon: "amazon.co.uk" },
};
const SEALED_SEARCHES = [
  { label: "Vendetta sealed", q: "Riftbound Vendetta sealed" },
  { label: "Booster boxes", q: "Riftbound booster box" },
  { label: "Booster packs", q: "Riftbound booster pack" },
  { label: "Proving Grounds kits", q: "Riftbound Proving Grounds" },
  { label: "All sealed Riftbound", q: "Riftbound TCG sealed" },
];

export const metadata: Metadata = {
  title: "Riftbound Sealed Products — Booster Boxes, Packs & Sets",
  description:
    "Compare prices on sealed Riftbound products — booster boxes, booster packs, Proving Grounds, bundles and more — across stores to find the cheapest.",
  alternates: { canonical: "/sealed" },
};

export default async function SealedPage({ searchParams }: { searchParams: { q?: string | string[] } }) {
  const country = getCountry();
  const info = COUNTRIES[country];
  // Sealed data is sourced per market (AU/NZ stores + US TCGplayer). For a market
  // with no rows of its own (e.g. UK), fall back to AU so the page is never blank —
  // and price it in AUD so the currency stays honest.
  let all = await getSealedGroups(country);
  let priceCountry = country;
  if (all.length === 0 && country !== "AU") {
    all = await getSealedGroups("AU");
    priceCountry = "AU";
  }
  const usingFallback = priceCountry !== country;
  const fmt = (cents: number) => formatMoney(cents, COUNTRIES[priceCountry].currency);
  const q = (typeof searchParams.q === "string" ? searchParams.q : "").trim();
  const ql = q.toLowerCase();
  const groups = ql
    ? all.filter(
        (g) =>
          g.name.toLowerCase().includes(ql) ||
          g.productType.toLowerCase().includes(ql) ||
          (g.setCode ?? "").toLowerCase().includes(ql)
      )
    : // Default view: float the freshly-live Vendetta (VEN) sealed to the top via a
      // stable sort, leaving every other group in its original order.
      all
        .map((g, i) => [g, i] as const)
        .sort((a, b) => {
          const av = a[0].setCode === "VEN" ? 0 : 1;
          const bv = b[0].setCode === "VEN" ? 0 : 1;
          return av - bv || a[1] - b[1];
        })
        .map(([g]) => g);

  // Show the "Vendetta is here" callout only on the unfiltered view, and only when
  // Vendetta sealed actually exists in the feed.
  const hasVendetta = !q && all.some((g) => g.setCode === "VEN");

  return (
    <div>
      <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-slate-300">Home</Link>
        <span>/</span>
        <span className="text-slate-300">Sealed</span>
      </nav>

      {/* Compact hero: aurora blob + dotted texture behind a brand→gold wash. The
          decorative layer is hidden from assistive tech. */}
      <section className="card-surface animate-fade-up relative mb-5 overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl animate-blob" />
          <div className="hero-dots absolute inset-0 opacity-60" />
        </div>
        <div className="relative bg-gradient-to-br from-brand-600/20 via-ink-850/40 to-gold/10 px-6 py-8">
          <h1 className="text-2xl font-extrabold text-white">Sealed Products</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Booster boxes, packs, Proving Grounds, bundles and other sealed Riftbound
            products — priced across {info.adjective} stores so you can find the cheapest.
            Wondering if a box is worth ripping?{" "}
            <Link href="/tools/box-ev" className="text-brand-400 hover:underline">Run the EV calculator →</Link>
          </p>
          {usingFallback && (
            <p className="mt-2 text-xs text-slate-500">
              We don&apos;t track {info.adjective} sealed stores yet — showing Australian listings (prices in AUD). Boxes ship internationally.
            </p>
          )}
          {q && (
            <p className="mt-2 text-sm text-slate-400">
              Showing matches for <span className="text-brand-400">“{q}”</span>.{" "}
              <Link href="/sealed" className="text-brand-400 hover:underline">Show all</Link>
            </p>
          )}
        </div>
      </section>

      {/* Freshly-live Vendetta sealed callout — only on the default (unfiltered) view. */}
      {hasVendetta && (
        <div className="card-surface mb-5 flex flex-wrap items-center gap-3 bg-gradient-to-br from-gold/10 via-ink-850/40 to-brand-600/10 px-5 py-4">
          <span className="chip bg-gold/20 font-semibold text-gold">✨ NEW</span>
          <p className="min-w-0 flex-1 text-sm text-slate-300">
            <span className="font-semibold text-white">Vendetta sealed is here</span> — booster
            boxes &amp; packs available now, priced across stores.
          </p>
          <Link href="/sealed?q=vendetta" className="btn-primary px-3 py-1.5 text-xs">
            Shop Vendetta →
          </Link>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
          <div>
            <p className="text-lg font-semibold text-white">
              {q ? `No sealed products match “${q}”` : "No sealed products yet"}
            </p>
            <p className="mt-1 text-sm">
              {q ? (
                <Link href="/sealed" className="text-brand-400 hover:underline">Show all sealed products</Link>
              ) : (
                "Our feeds refresh regularly — check back soon."
              )}
            </p>
          </div>
        </div>
      ) : (
        <Reveal stagger className="grid gap-4 lg:grid-cols-2">
          {groups.map((g) => (
            <div key={g.groupKey} className="card-surface overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-glow">
              <div className="flex gap-4 p-4">
                <div className="h-28 w-28 shrink-0 overflow-hidden rounded-lg bg-ink-900">
                  {g.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={g.imageUrl} alt={g.name} className="h-full w-full object-contain" loading="lazy" decoding="async" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="chip bg-brand-500/15 font-semibold text-brand-300">{g.productType}</span>
                    {g.setCode && <span className="chip bg-ink-800 text-slate-300">{g.setCode}</span>}
                  </div>
                  <h2 className="mt-1 font-bold text-white">{g.name}</h2>
                  <div className="mt-1 text-sm text-slate-500">
                    {g.lowestPriceCents != null ? (
                      <>
                        from <span className="text-lg font-bold text-accent">{fmt(g.lowestPriceCents)}</span>
                        {" · "}{g.storeCount} {g.storeCount === 1 ? "store" : "stores"}
                      </>
                    ) : (
                      "currently unavailable"
                    )}
                  </div>
                </div>
              </div>
              <ul className="divide-y divide-ink-800 border-t border-ink-800">
                {g.listings.slice(0, 6).map((l, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-white">{l.retailerName}</div>
                      <div className="text-xs">
                        {l.inStock ? <span className="text-brand-400">● In stock</span> : <span className="text-slate-500">● Out of stock</span>}
                      </div>
                    </div>
                    {i === 0 && l.inStock && (
                      <span className="chip bg-gold/20 text-gold">Best price</span>
                    )}
                    <div className={`text-sm font-bold ${i === 0 && l.inStock ? "text-accent" : "text-white"} ${!l.inStock ? "text-slate-500 line-through" : ""}`}>
                      {fmt(l.priceCents)}
                    </div>
                    <OutboundLink href={affiliateUrl(l.url, l.retailer)} retailer={l.retailer} country={country} kind="sealed" className={`${i === 0 && l.inStock ? "btn-accent" : "btn-primary"} px-3 py-1.5 text-xs`}>
                      View →
                    </OutboundLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Reveal>
      )}

      {/* High-AOV marketplace searches: sealed boxes are the biggest baskets on the
          site, and eBay/Amazon both carry them. Affiliate-tagged per market. */}
      <section className="card-surface mt-8 p-5">
        <h2 className="text-lg font-extrabold text-white">🛒 More sealed deals on the big marketplaces</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Boxes sell out and restock constantly — eBay and Amazon often have stock (or better
          prices) when stores don&apos;t. Worth a look before you buy.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {SEALED_SEARCHES.map((x) => {
            const mkt = MARKETPLACE_HOSTS[country] ?? MARKETPLACE_HOSTS.AU;
            return (
              <div key={x.q} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2.5">
                <span className="text-sm font-semibold text-white">{x.label}</span>
                <span className="flex gap-1.5">
                  <OutboundLink
                    href={ebayAffiliateUrl(`https://www.${mkt.ebay}/sch/i.html?_nkw=${encodeURIComponent(x.q)}`)}
                    retailer="ebay_sealed_search"
                    country={country}
                    kind="sealed"
                    className="btn-ghost px-2.5 py-1 text-xs"
                  >
                    eBay →
                  </OutboundLink>
                  <OutboundLink
                    href={affiliateUrl(`https://www.${mkt.amazon}/s?k=${encodeURIComponent(x.q)}`, "amazon_sealed")}
                    retailer="amazon_sealed_search"
                    country={country}
                    kind="sealed"
                    className="btn-ghost px-2.5 py-1 text-xs"
                  >
                    Amazon →
                  </OutboundLink>
                </span>
              </div>
            );
          })}
        </div>
      </section>


      <p className="mt-6 text-center text-[11px] text-slate-600">
        Sealed prices are collected from public store listings and may change. RiftCompare
        may earn a commission on some outbound links.
      </p>
    </div>
  );
}
