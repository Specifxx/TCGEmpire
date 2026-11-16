"use client";
// A small unpriced "Also on Amazon" line under the sealed page's price list (owner, 2026-11-16). The 2026-11-12 rule (Amazon row only with a
// real price) took Amazon clicks to zero; this is not a row: one line, no price, labelled paid, only on the product page (never the quick
// view), only for a product Amazon sells (the caller's amazonSellsSealed), and only once the price lookup has answered that there is no live
// price (when there is one, the row shows it). The shared tag and the same tagged search the row used; never ranked, best, a deal or an alert.
import { useEffect, useState } from "react";
import type { Country } from "@/lib/country";
import { OutboundLink } from "./OutboundLink";
import { PaidLinkTag } from "./AffiliateDisclosure";

export function AmazonAlsoLink({ country, slug, name, label, href }: { country: Country; slug: string; name: string; label: string; href: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
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
  }, [country, slug]);
  if (!show) return null;
  return (
    <p className="mt-2 text-[11px] text-slate-400">
      Also on {label}:{" "}
      <OutboundLink href={href} retailer="amazon_sealed" country={country} kind="sealed" pageType="sealed" surface="amazon_also" className="font-semibold text-brand-400 hover:underline">
        see {name} on {label} ↗
      </OutboundLink>{" "}
      <PaidLinkTag /> <span>Price not shown.</span>
    </p>
  );
}
