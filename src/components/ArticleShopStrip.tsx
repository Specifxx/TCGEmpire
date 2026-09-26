"use client";

import { useCountry } from "@/components/CountryProvider";
import { OutboundLink } from "@/components/OutboundLink";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { ebaySearchUrl } from "@/lib/affiliate";
import type { ShopLink } from "@/lib/articles";

// "Shop this guide" — turns a well-ranking article into actual purchases. Renders the
// article's eBay searches as affiliate-tagged links on the visitor's own eBay site
// (AU/US/UK/SG/CA/EU). Client component: localises per market without touching the
// article page's static rendering.
//
// MEASURED BY PLACEMENT (2026-09-26). Every click fires buy_click through
// OutboundLink with page_type "article" and a surface naming WHERE the strip sat:
// `shop_strip_inline` when the body placed it mid-article with [[shop]],
// `shop_strip_end` at the default spot after the body. The EPN sub-id splits the
// same way ("guide-inline" / "guide-strip"), so eBay's own earnings report can
// compare the two as well. (This comment used to say clicks reached
// /admin/clicks — that beacon has been off since 2026-07-23.)
export function ArticleShopStrip({
  items,
  placement = "end",
}: {
  items: ShopLink[];
  /** "inline" = positioned in the body by a [[shop]] marker; "end" = ArticleView's
   *  default after-the-body spot. */
  placement?: "inline" | "end";
}) {
  const { country } = useCountry();
  if (!items.length) return null;

  return (
    <section className="card-surface mt-8 overflow-hidden" data-shop-strip={placement}>
      <div className="flex items-center justify-between gap-2 border-b border-ink-700 bg-ink-950/60 px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-white">
          <span aria-hidden>🛒</span> Shop this guide
        </h2>
        <span className="chip bg-gold/20 text-[10px] font-bold uppercase tracking-wider text-gold">eBay</span>
      </div>
      <ul className="divide-y divide-ink-800">
        {items.map((it, i) => (
          <li key={it.query}>
            <OutboundLink
              href={ebaySearchUrl(country, it.query, placement === "inline" ? "guide-inline" : "guide-strip")}
              retailer="ebay"
              country={country}
              kind="single"
              pageType="article"
              surface={placement === "inline" ? "shop_strip_inline" : "shop_strip_end"}
              positionInList={i + 1}
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
