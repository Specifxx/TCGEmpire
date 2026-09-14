import { affiliateUrl } from "@/lib/affiliate";
import { OutboundLink } from "@/components/OutboundLink";
import { formatMoney } from "@/lib/format";
import type { SealedGroup } from "@/lib/sealed-import";
import type { Country } from "@/lib/country";

// Extracted from /radiance-preorders — the per-product, per-store price card
// list, cheapest listing highlighted. Now shared with the Radiance hub
// (/sets/radiance) so a real cross-store table can render there too, rather
// than a second hand-rolled copy of this markup drifting from the original.
//
// Every price here is a PRE-ORDER: nothing has shipped, so the caller is
// expected to have sourced `groups` from getPreorderGroups() (never
// getSealedGroups(), which mixes in in-stock inventory), and the disclosure
// paragraph below says so explicitly.

// Only a group with a real price is worth showing; the rest would be an
// empty row. Exported so a caller can check "is there anything to show" for
// its own empty-state branching without re-deriving this filter a second time.
export function pricedPreorderGroups(groups: SealedGroup[]): SealedGroup[] {
  return groups
    .filter((g) => g.lowestPriceCents != null && g.listings.length > 0)
    .sort((a, b) => (a.lowestPriceCents ?? 9e9) - (b.lowestPriceCents ?? 9e9));
}

export function PreorderPriceTable({
  groups,
  country,
  currency,
}: {
  groups: SealedGroup[];
  country: Country;
  currency: string;
}) {
  const priced = pricedPreorderGroups(groups);
  if (priced.length === 0) return null;

  const storeCount = new Set(priced.flatMap((g) => g.listings.map((l) => l.retailer))).size;

  return (
    <div>
      <p className="text-xs text-slate-500">
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
                  <h3 className="truncate font-bold text-white">{g.name}</h3>
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
        or a deposit now for stock that ships after release. Pre-order prices move before release, and store terms
        differ, so confirm both at checkout.
      </p>
      {/* Store links here are affiliate-tagged (affiliateUrl), so this block carries
          its own disclosure — AffiliateDisclosure only speaks for eBay/TCGplayer. */}
      <p className="mt-2 text-[11px] leading-snug text-slate-400">
        Some store links above are affiliate links. If you pre-order through one we may earn a commission, at no
        extra cost to you. It never affects the ranking — these are sorted purely by price.
      </p>
    </div>
  );
}
