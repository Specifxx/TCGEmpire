"use client";

import { OutboundLink } from "./OutboundLink";
import { useCountry } from "./CountryProvider";
import { formatMoney } from "@/lib/format";

export interface GradedRow {
  itemId: string;
  cardId: string;
  country: string;
  priceCents: number;
  shippingCents: number | null;
  currency: string;
  url: string;
  title: string;
  imageUrl: string | null;
  grader: string | null;
  grade: number | null;
  /** Cheapest tracked RAW Buy It Now for this card in this market, same currency.
   *  null when we have no live raw price to compare against. */
  marketCents: number | null;
}

// Grader house colours, so the badge is recognisable at a glance the way the
// slab label is. Muted to sit inside the site's palette rather than shouting.
const GRADER_STYLE: Record<string, string> = {
  PSA: "bg-[#d4342c]/15 text-[#ff8a84]",
  BGS: "bg-[#1f6feb]/15 text-[#79b8ff]",
  CGC: "bg-[#2da44e]/15 text-[#7ee787]",
  SGC: "bg-[#8957e5]/15 text-[#c9a6ff]",
};

/**
 * Graded (slabbed) eBay listings for a chase card.
 *
 * The category our own comparison structurally cannot cover: no tracked store
 * lists PSA/BGS/CGC/SGC copies, so for a slab eBay is not a cheaper option — it
 * is the only market. That is why this is worth a tab rather than a footnote.
 *
 * A slab price is NOT compared as if it were a raw price. The multiple against
 * raw is shown ("3.2x raw") because that is the number a collector is actually
 * weighing, but it is never framed as cheaper or dearer — a PSA 10 and a raw NM
 * are different products, and this component never implies otherwise.
 */
export function EbayGradedLive({ listings }: { listings: GradedRow[] }) {
  const { country } = useCountry();

  const rows = listings.filter((l) => l.country === country);
  if (rows.length === 0) return null;

  return (
    <div>
      <ul className="divide-y divide-ink-800">
        {rows.map((l) => {
          // Both figures are this market's own, so they share a currency by
          // construction; only presence needs checking.
          const multiple =
            l.marketCents != null && l.marketCents > 0 ? l.priceCents / l.marketCents : null;
          const badge = l.grader ? GRADER_STYLE[l.grader] ?? "bg-ink-800 text-slate-300" : "bg-ink-800 text-slate-400";
          return (
            <li key={`${l.country}-${l.itemId}`}>
              <OutboundLink
                href={l.url}
                retailer="ebay_graded"
                country={country}
                className="group flex items-center gap-3 py-3 transition-colors hover:bg-ink-800/60"
              >
                {l.imageUrl && (
                  // Arbitrary eBay CDN hosts, so a plain lazy <img> rather than
                  // next/image (each host would need allow-listing).
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={l.imageUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-14 w-11 shrink-0 rounded object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`chip text-[10px] font-bold uppercase tracking-wide ${badge}`}>
                      {l.grader ?? "Graded"}
                      {l.grade != null && <span className="num ml-1">{l.grade}</span>}
                    </span>
                    {/* No number in the title: say so rather than guess. A wrong
                        grade misvalues the card by a wide margin. */}
                    {l.grader != null && l.grade == null && (
                      <span className="text-[10px] text-slate-500">grade not stated in listing</span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-slate-500" title={l.title}>
                    {l.title}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="num text-sm font-extrabold text-white">
                    {formatMoney(l.priceCents, l.currency)}
                  </div>
                  {multiple != null && (
                    <div className="num text-[11px] text-slate-500">{multiple.toFixed(1)}× raw</div>
                  )}
                  {l.shippingCents === 0 && <div className="text-[10px] text-brand-400">Free postage</div>}
                </div>
              </OutboundLink>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] leading-snug text-slate-500">
        Slabbed copies on eBay. No tracked store lists graded cards, so these have no local
        comparison — the multiple is against the cheapest raw copy we track.
      </p>
    </div>
  );
}
