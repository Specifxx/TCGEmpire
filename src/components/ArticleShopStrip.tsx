"use client";

import { useCountry } from "@/components/CountryProvider";
import { OutboundLink } from "@/components/OutboundLink";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { ebaySearchUrl } from "@/lib/affiliate";
import type { ShopLink } from "@/lib/articles";

// "Shop this guide" — turns a well-ranking article into actual purchases. Renders the
// article's eBay searches as affiliate-tagged links on the visitor's own eBay site
// (AU/US/UK/SG/CA/DE). Client component: localises
// per market without touching the article page's static rendering, and every click
// fires the OutboundLink beacon so it shows up in /admin/clicks with the article path.
export function ArticleShopStrip({ items }: { items: ShopLink[] }) {
  const { country } = useCountry();
  if (!items.length) return null;

  return (
    <section className="card-surface mt-8 overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-ink-700 bg-ink-950/60 px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-white">
          <span aria-hidden>🛒</span> Shop this guide
        </h2>
        <span className="chip bg-gold/20 text-[10px] font-bold uppercase tracking-wider text-gold">eBay</span>
      </div>
      <ul className="divide-y divide-ink-800">
        {items.map((it) => (
          <li key={it.query}>
            <OutboundLink
              href={ebaySearchUrl(country, it.query, "guide-strip")}
              retailer="ebay"
              country={country}
              kind="single"
              className="flex items-center justify-between gap-3 px-5 py-3 text-sm transition-colors hover:bg-ink-800"
            >
              <span className="font-semibold text-white">{it.label}</span>
              <span className="shrink-0 text-brand-400">View listings →</span>
            </OutboundLink>
          </li>
        ))}
      </ul>
      {/* Already carried a disclosure, but at slate-600 and without naming EPN —
          upgraded to the shared component for consistent wording + contrast. */}
      <div className="border-t border-ink-800 px-5 py-2.5">
        <AffiliateDisclosure partner="ebay" tight className="mt-0" />
        <p className="mt-1 text-[11px] leading-snug text-slate-500">
          Live listings on your local eBay. Always check seller ratings before buying.
        </p>
      </div>
    </section>
  );
}
