"use client";
// The right-hand part of the sealed page's Amazon row: on load it asks /api/amazon/sealed/<slug>?c=<market> (CDN-cached
// six hours) for Amazon's own price of this product. With one, the row shows the price with the time it was fetched and
// Amazon's disclaimer, as its licence requires, and the button opens Amazon's own item page; without one (no API access
// for this store yet, no match, or a price older than 24 hours) it keeps "Price shows on Amazon" and the tagged search.
// The price is drawn here alone: never a store row, the best price, a deal, an alert or a watch.
import { useEffect, useState } from "react";
import type { Country } from "@/lib/country";
import { OutboundLink } from "./OutboundLink";
import { PaidLinkTag } from "./AffiliateDisclosure";

const MAX_AGE_MS = 24 * 3600_000;
export const AMAZON_PRICE_DISCLAIMER =
  "Product prices and availability are accurate as of the date/time indicated and are subject to change. Any price and availability information displayed on Amazon at the time of purchase will apply to the purchase of this product.";

interface Live { status: string; url?: string; price?: string; at?: string; timeZone?: string; zoneLabel?: string }

export function AmazonLiveSlot({ country, slug, label, searchHref }: { country: Country; slug: string; label: string; searchHref: string }) {
  const [live, setLive] = useState<Live | null>(null);
  useEffect(() => {
    let on = true;
    fetch(`/api/amazon/sealed/${encodeURIComponent(slug)}?c=${encodeURIComponent(country)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Live | null) => {
        if (on && j?.status === "ok" && j.url && j.price && j.at && Date.now() - Date.parse(j.at) < MAX_AGE_MS) setLive(j);
      })
      .catch(() => null);
    return () => {
      on = false;
    };
  }, [country, slug]);
  const when = live?.at ? new Date(live.at).toLocaleString("en-GB", { timeZone: live.timeZone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
  return (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-white">{label}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
          <span>{live ? `Amazon's own listing · as of ${when} ${live.zoneLabel}*` : "Price shows on Amazon"}</span>
          <PaidLinkTag />
        </div>
        {live && <p className="mt-0.5 text-[10px] leading-4 text-slate-600">* {AMAZON_PRICE_DISCLAIMER}</p>}
      </div>
      {live && (
        <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-white" title={AMAZON_PRICE_DISCLAIMER}>
          {live.price}
        </span>
      )}
      <OutboundLink href={live?.url ?? searchHref} retailer="amazon_sealed" country={country} kind="sealed" pageType="sealed" surface={live ? "amazon_live" : "amazon_search"} className="btn-buy px-3 py-1.5 text-xs">
        {live ? "View →" : "Check price →"}
      </OutboundLink>
    </>
  );
}
