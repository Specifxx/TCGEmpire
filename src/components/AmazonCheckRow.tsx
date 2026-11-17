"use client";
// The unpriced "Check on Amazon" row (owner, 2026-11-17: "even if there are no Amazon prices available, we should have an option to check
// on Amazon in our price rows"). The 2026-11-12 rule (Amazon row only with a real price) took Amazon clicks to zero and the 2026-11-16 line
// under the list was too quiet. An ordinary LAST row of the sealed list, on the page and in the quick view, labelled "Ad"/paid, only for a
// product Amazon sells (the caller's amazonSellsSealed), and on the page only once the price lookup says there is no live price (with one,
// AmazonLiveSlot's priced row shows). The shared tag; never pinned, ranked, the best price, a deal or an alert.
import { useEffect, useState } from "react";
import type { Country } from "@/lib/country";
import { OutboundLink } from "./OutboundLink";
import { PaidLinkTag } from "./AffiliateDisclosure";

export function AmazonCheckRow({ country, slug, name, label, href, lookup }: { country: Country; slug: string; name: string; label: string; href: string; lookup: boolean }) {
  const [show, setShow] = useState(!lookup);
  useEffect(() => {
    if (!lookup) return;
    let on = true;
    fetch(`/api/amazon/sealed/${encodeURIComponent(slug)}?c=${encodeURIComponent(country)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { status?: string; url?: string; price?: string; at?: string } | null) => {
        const live = j?.status === "ok" && j.url && j.price && j.at && Date.now() - Date.parse(j.at) < 24 * 3600_000;
        if (on) setShow(!live);
      })
      .catch(() => {
        if (on) setShow(true);
      });
    return () => {
      on = false;
    };
  }, [country, slug, lookup]);
  if (!show) return null;
  return (
    <ul className="mt-1 border-t border-ink-800" data-amazon-check="">
      <li className="-mx-2 flex items-center gap-3 px-2 py-2.5">
        <div className="min-w-0 flex-1">
          <span className="truncate text-sm font-semibold text-white">{label}</span>
          <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
            <span className="truncate">Check {name} on {label}</span>
            <PaidLinkTag />
          </div>
        </div>
        <OutboundLink href={href} retailer="amazon_sealed" country={country} kind="sealed" pageType="sealed" surface="amazon_also" className="shrink-0 px-3 py-1.5 text-xs font-semibold text-brand-400 hover:underline">
          Check on Amazon ↗
        </OutboundLink>
      </li>
    </ul>
  );
}
