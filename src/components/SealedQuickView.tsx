"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { SealedGroup } from "@/lib/sealed-import";
import { OutboundLink } from "./OutboundLink";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { useCountry } from "./CountryProvider";
import { affiliateUrl, ebayAffiliateUrl } from "@/lib/affiliate";
import { formatMoney } from "@/lib/format";

// Quick-view popup for sealed products — the sealed twin of QuickView.tsx (cards).
// Clicking a SealedTile opens this instead of expanding the whole /sealed page, so
// the full price board appears instantly, in place. Everything it shows is already
// on the SealedGroup the tile holds, so it needs NO network fetch. RiftCompare has
// no /sealed/<slug> detail route, so this modal is self-contained: no history push
// (nothing to push to) and no "view full page" link — it IS the full view.
type OpenArg = { group: SealedGroup; currency: string };

const Ctx = createContext<{ open: (group: SealedGroup, currency: string) => void }>({ open: () => {} });
export const useSealedQuickView = () => useContext(Ctx);

// eBay hosts per market (NZ has no local eBay — the AU site ships there). Mirrors
// the marketplace hosts the /sealed page uses for its secondary-market searches.
const EBAY_HOST: Record<string, string> = {
  AU: "ebay.com.au",
  NZ: "ebay.com.au",
  US: "ebay.com",
  UK: "ebay.co.uk",
};

export function SealedQuickViewProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<OpenArg | null>(null);

  const open = useCallback((group: SealedGroup, currency: string) => setState({ group, currency }), []);
  const close = useCallback(() => setState(null), []);

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {state && <SealedQuickViewModal group={state.group} currency={state.currency} onClose={close} />}
    </Ctx.Provider>
  );
}

function SealedQuickViewModal({ group, currency, onClose }: { group: SealedGroup; currency: string; onClose: () => void }) {
  const { country } = useCountry();
  const fmt = (cents: number) => formatMoney(cents, currency);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const listings = group.listings;
  const lowest = group.lowestPriceCents;
  const host = EBAY_HOST[country] ?? EBAY_HOST.AU;
  const ebayHref = ebayAffiliateUrl(`https://www.${host}/sch/i.html?_nkw=${encodeURIComponent(group.name)}`);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-lg border border-ink-700 bg-ink-900 shadow-2xl">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-20 tap-icon  rounded-full bg-ink-950/80 text-slate-300 hover:text-white"
        >
          ✕
        </button>

        <div className="max-h-[88vh] overflow-y-auto">
          {/* Header: image + identity + cheapest price */}
          <div className="flex gap-4 border-b border-ink-800 p-5">
            <div className="grid aspect-square w-28 shrink-0 place-items-center overflow-hidden rounded-lg border border-ink-800 bg-ink-950 p-2 sm:w-32">
              {group.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={group.imageUrl} alt={group.name} className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="px-1 text-center text-xs font-bold text-slate-600">{group.productType}</span>
              )}
            </div>
            <div className="min-w-0 flex-1 pr-8">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="chip bg-brand-500/15 font-semibold text-brand-300">{group.productType}</span>
                {group.setCode && <span className="chip bg-ink-800 text-slate-300">{group.setCode}</span>}
              </div>
              <h2 className="mt-1.5 text-lg font-extrabold leading-tight text-white">{group.name}</h2>
              <div className="mt-2">
                {lowest != null ? (
                  <>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Cheapest price</div>
                    <div className="num text-2xl font-extrabold text-accent">{fmt(lowest)}</div>
                  </>
                ) : (
                  <div className="text-lg font-extrabold text-down">Currently unavailable</div>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {group.storeCount} {group.storeCount === 1 ? "store" : "stores"} in stock
              </p>
              {/* Availability-at-MSRP signal (A4). */}
              {lowest != null && group.msrpCents != null && (
                <div className="mt-1.5">
                  {group.atMsrp ? (
                    <span className="chip bg-emerald-500/15 font-semibold text-emerald-400">
                      ✓ In stock at MSRP ({fmt(group.msrpCents)})
                    </span>
                  ) : group.overMsrpPct != null && group.overMsrpPct > 0 ? (
                    <span className="chip bg-red-500/15 font-semibold text-red-400">
                      {Math.round(group.overMsrpPct)}% over MSRP ({fmt(group.msrpCents)})
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {/* Price comparison — every tracked store, cheapest in-stock first */}
          <div className="p-4">
            <div className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Price comparison</div>
            {listings.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-400">
                <p>No store is listing this right now.</p>
                <OutboundLink href={ebayHref} retailer="ebay_sealed_search" country={country} kind="sealed" className="btn-primary mt-3 inline-flex text-xs">
                  Search on eBay →
                </OutboundLink>
              </div>
            ) : (
              <ul className="divide-y divide-ink-800">
                {listings.map((l, i) => (
                  <li key={i} className={`flex items-center gap-3 py-2.5 ${l.inStock ? "" : "opacity-55"}`}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white">{l.retailerName}</div>
                      <div className="text-[11px]">
                        {l.inStock ? <span className="text-brand-400">● In stock</span> : <span className="text-slate-500">● Out of stock</span>}
                      </div>
                    </div>
                    {i === 0 && l.inStock && <span className="chip shrink-0 bg-gold/20 text-gold">Best price</span>}
                    <div className={`num text-right text-sm font-bold ${i === 0 && l.inStock ? "text-accent" : "text-white"} ${!l.inStock ? "text-slate-500 line-through" : ""}`}>
                      {fmt(l.priceCents)}
                    </div>
                    <OutboundLink
                      href={affiliateUrl(l.url, l.retailer)}
                      retailer={l.retailer}
                      country={country}
                      kind="sealed"
                      className={`px-3 py-1.5 text-xs ${i === 0 && l.inStock ? "btn-accent" : "btn-primary"}`}
                    >
                      View →
                    </OutboundLink>
                  </li>
                ))}
              </ul>
            )}

            {listings.length > 0 && (
              <p className="mt-2 border-t border-ink-800 pt-2 text-right text-[11px]">
                <OutboundLink href={ebayHref} retailer="ebay_sealed_search" country={country} kind="sealed" className="font-semibold text-brand-400 hover:underline">
                  Search eBay for more listings →
                </OutboundLink>
              </p>
            )}
            {/* This modal carries affiliate-tagged store + eBay links exactly like
                the singles quick-view, so it needs its own in-popup disclosure. */}
            <AffiliateDisclosure partner="both" />
          </div>
        </div>
      </div>
    </div>
  );
}
