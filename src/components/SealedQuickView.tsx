"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import type { SealedGroup } from "@/lib/sealed-import";
import { OutboundLink } from "./OutboundLink";
import { ReportPriceButton } from "./ReportPriceButton";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { useCountry } from "./CountryProvider";
import { affiliateUrl, ebayAffiliateUrl } from "@/lib/affiliate";
import { formatMoney } from "@/lib/format";
import { sealedImageAlt } from "@/lib/image-alt";
import { Dialog } from "./ui/Dialog";
import { CheckedAgo } from "./CheckedAgo";
import { headlineOffer, offerStock, offerStockLabel, rankOffers } from "@/lib/sealed-offers";
import { isPreorderSetCode } from "@/lib/constants";

// Quick-view popup for sealed products — the sealed twin of QuickView.tsx (cards).
// Clicking a SealedTile opens this instead of expanding the whole /sealed page, so
// the full price board appears instantly, in place. Everything it shows is already
// on the SealedGroup the tile holds, so it needs NO network fetch. RiftCompare has
// no /sealed/<slug> detail route, so this modal is self-contained: no history push
// (nothing to push to) and no "view full page" link — it IS the full view.
type OpenArg = { group: SealedGroup; currency: string };

const Ctx = createContext<{ open: (group: SealedGroup, currency: string) => void }>({ open: () => {} });
export const useSealedQuickView = () => useContext(Ctx);

// eBay hosts per market. Mirrors the marketplace hosts the /sealed page uses
// for its secondary-market searches.
const EBAY_HOST: Record<string, string> = {
  AU: "ebay.com.au",
  US: "ebay.com",
  UK: "ebay.co.uk",
};

export function SealedQuickViewProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<OpenArg | null>(null);
  // Kept around through a close so the panel still has content to render
  // while Dialog's exit transition plays — same shape as QuickView's own
  // lastCardRef.
  const lastStateRef = useRef<OpenArg | null>(null);
  if (state) lastStateRef.current = state;
  const displayState = state ?? lastStateRef.current;

  const open = useCallback((group: SealedGroup, currency: string) => {
    setState({ group, currency });
    // Sealed twin of QuickView's quickview_open — same event name, so the two
    // surfaces roll up into one engagement metric rather than splitting it.
    trackEvent("quickview_open", { card: group.groupKey });
  }, []);
  const close = useCallback(() => setState(null), []);

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      <Dialog open={!!state} onClose={close} size="2xl" z="overlay" labelledBy="sealed-quickview-title">
        {displayState && (
          <SealedQuickViewModal key={displayState.group.groupKey} group={displayState.group} currency={displayState.currency} onClose={close} />
        )}
      </Dialog>
    </Ctx.Provider>
  );
}

function SealedQuickViewModal({ group, currency, onClose }: { group: SealedGroup; currency: string; onClose: () => void }) {
  const { country } = useCountry();
  const fmt = (cents: number) => formatMoney(cents, currency);

  // Open offers first, then unconfirmed, then sold out (lib/sealed-offers.ts) —
  // the same order and the same three states as /radiance-preorders.
  const listings = rankOffers(group.listings);
  const best = headlineOffer(listings);
  const preorder = isPreorderSetCode(group.setCode);
  // One entry per STORE, in-stock and out-of-stock alike ("you list it as
  // available and it isn't" is one of the issue types). Deduped defensively —
  // grouping should already give one row per retailer, but the picker must never
  // show the same store twice.
  const reportable = [
    ...new Map(listings.map((l) => [l.retailer, { retailer: l.retailer, retailerName: l.retailerName }])).values(),
  ];
  const lowest = group.lowestPriceCents;
  const host = EBAY_HOST[country] ?? EBAY_HOST.AU;
  const ebayHref = ebayAffiliateUrl(`https://www.${host}/sch/i.html?_nkw=${encodeURIComponent(group.name)}`);

  return (
    <div className="max-h-[88vh] overflow-hidden rounded-lg border border-ink-700 bg-ink-900 shadow-2xl">
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
                <img src={group.imageUrl} alt={sealedImageAlt(group.name)} className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="px-1 text-center text-xs font-bold text-slate-600">{group.productType}</span>
              )}
            </div>
            <div className="min-w-0 flex-1 pr-8">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="chip bg-brand-500/15 font-semibold text-brand-300">{group.productType}</span>
                {group.setCode && <span className="chip bg-ink-800 text-slate-300">{group.setCode}</span>}
              </div>
              <h2 id="sealed-quickview-title" className="mt-1.5 text-lg font-extrabold leading-tight text-white">{group.name}</h2>
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
                {listings.map((l, i) => {
                  const state = offerStock(l);
                  const isOpen = state === "open";
                  const isBest = l === best;
                  return (
                    <li key={i} data-stock={state} className={`flex items-center gap-3 py-2.5 ${isOpen ? "" : "opacity-55"}`}>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-white">{l.retailerName}</div>
                        <div className="flex flex-wrap items-center gap-x-2 text-[11px]">
                          <span className={isOpen ? "text-brand-400" : "text-slate-500"}>● {offerStockLabel(state, preorder)}</span>
                          <CheckedAgo iso={l.lastSeen} className="text-slate-500" />
                        </div>
                      </div>
                      {isBest && <span className="chip shrink-0 bg-gold/20 text-gold">Best price</span>}
                      <div className={`num text-right text-sm font-bold ${isBest ? "text-accent" : "text-white"} ${!isOpen ? "text-slate-500 line-through" : ""}`}>
                        {fmt(l.priceCents)}
                      </div>
                      <OutboundLink
                        href={affiliateUrl(l.url, l.retailer)}
                        retailer={l.retailer}
                        country={country}
                        kind="sealed"
                        className={
                          isOpen
                            ? `px-3 py-1.5 text-xs ${isBest ? "btn-accent" : "btn-primary"}`
                            : "px-3 py-1.5 text-xs text-slate-500 underline-offset-2 hover:underline"
                        }
                      >
                        View →
                      </OutboundLink>
                    </li>
                  );
                })}
              </ul>
            )}

            {listings.length > 0 && (
              <p className="mt-2 border-t border-ink-800 pt-2 text-right text-[11px]">
                <OutboundLink href={ebayHref} retailer="ebay_sealed_search" country={country} kind="sealed" className="font-semibold text-brand-400 hover:underline">
                  Search eBay for more listings →
                </OutboundLink>
              </p>
            )}
            {/* Sealed's ONLY report surface, and it has to be: there is no
                /sealed/<slug> detail route (see this file's header) and the
                /sealed tiles show a cheapest price without naming the store, so
                this modal is the only place a visitor can see which store's
                number is wrong. Sealed listings carry no id of their own, so the
                report identifies them by groupKey + retailer + market — which is
                what the API looks them up by. */}
            {reportable.length > 0 && (
              <div className="mt-2 text-center">
                <ReportPriceButton
                  compact
                  subject={{ kind: "sealed", groupKey: group.groupKey, name: group.name }}
                  listings={reportable}
                />
              </div>
            )}
            {/* This modal carries affiliate-tagged store + eBay links exactly like
                the singles quick-view, so it needs its own in-popup disclosure. */}
            <AffiliateDisclosure partner="both" />
          </div>
        </div>
    </div>
  );
}
