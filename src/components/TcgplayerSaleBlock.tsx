import { OutboundLink } from "./OutboundLink";
import { affiliateUrl } from "@/lib/affiliate";

// The Black Friday and Cyber Monday pages' TCGplayer block (DECISIONS.md, "Black Friday strip on sealed pages", 2026-11-21
// amendment): one "Ad"-labelled card of tagged TCGplayer searches for Riftbound sealed, under the deals and the price watch,
// never above a price. It claims no price and no discount, ranks nothing, and is never a store or the cheapest: TCGplayer's
// sellers set their own prices, so the visitor checks them against the store prices above. Clicks: surface "bf_page".
const BASE = "https://www.tcgplayer.com/search/riftbound-league-of-legends-trading-card-game/product?ProductTypeName=Sealed+Products";
const SEARCHES: { label: string; q: string }[] = [
  { label: "Booster boxes", q: "booster box" },
  { label: "Champion decks", q: "champion deck" },
  { label: "All sealed Riftbound", q: "" },
];

export function TcgplayerSaleBlock({ name, country, pageType, path }: { name: string; country: string; pageType: string; path: string }) {
  return (
    <section aria-labelledby="tcgplayer-sale" data-tcgplayer-sale="" className="card-surface mt-8 px-5 py-4">
      <div className="flex items-center gap-2">
        <span className="rounded border border-ink-700 px-1.5 text-[11px] font-semibold uppercase leading-5 text-slate-400">Ad</span>
        <h2 id="tcgplayer-sale" className="font-bold text-white">
          {name} on TCGplayer
        </h2>
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
        TCGplayer&rsquo;s sellers set their own prices, so we don&rsquo;t count them as a store or rank them here. Check what you find against the store
        prices above. Paid links: we may earn a commission, at no cost to you.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2 text-sm">
        {SEARCHES.map((s) => (
          <li key={s.label}>
            <OutboundLink
              href={affiliateUrl(s.q ? `${BASE}&q=${encodeURIComponent(s.q)}` : BASE, "tcgplayer", path)}
              retailer="tcgplayer"
              country={country}
              kind="sealed"
              pageType={pageType}
              surface="bf_page"
              className="btn-ghost"
            >
              {s.label}
            </OutboundLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
