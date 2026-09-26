"use client";

import { OutboundLink } from "./OutboundLink";
import { AffiliateDisclosure, PaidLinkTag } from "./AffiliateDisclosure";
import { usePremium } from "./PremiumProvider";

// "Also on eBay" — a labelled block of eBay SEARCH links that sits BESIDE a
// ranked comparison, never inside it (2026-09-26, "Pushing eBay clicks" in
// DECISIONS.md). eBay is the site's main affiliate partner and the owner asked
// for more of its clicks, including where stores are cheaper; the published
// promise (editorial policy, /about, the pre-order table's own footnote) is that
// earning never changes the ORDER of a comparison. This component is how both
// hold at once:
//
//  - it is visibly separate from the ranked rows and says so ("separate from
//    the price ranking");
//  - it carries the per-link "Paid link" tag and the EPN disclosure right under
//    it (AffiliateDisclosure's rules: visible on first paint, every visitor);
//  - every link is a SEARCH ("Search eBay for …"), so it never claims a price,
//    a stock level or that eBay is cheaper — none of which we would know;
//  - no urgency, no countdown, no guarantee claims about eBay's programmes.
//
// Hrefs arrive pre-built: callers build them with lib/affiliate.ts's
// ebaySearchUrl on the SERVER where they can (EBAY_AFFILIATE_CAMPAIGN is not a
// NEXT_PUBLIC variable, so a browser-built URL only ever sees the code default).
// It is a client component only to read the ad-free flag: a `promo` link — a
// cross-sell to something the page is not about — is advertising, and paying
// members were promised no ads; the links that serve the page's own subject stay
// for everyone, like EbayBuyCta.

export interface EbaySearchLink {
  label: string;
  href: string;
  /** A cross-sell rather than the page's own subject: hidden for ad-free members. */
  promo?: boolean;
}

export function EbaySearchPanel({
  heading,
  sub,
  links,
  country,
  pageType,
  variant = "panel",
  headingLevel = 2,
  className,
}: {
  heading: string;
  sub?: string;
  links: EbaySearchLink[];
  country: string;
  pageType: string;
  /** "panel": a titled block of links. "strip": one compact line. */
  variant?: "panel" | "strip";
  /** The panel's heading level: 3 inside a section that already has its own h2
   *  (the Radiance hub), so the page outline does not put the next section
   *  under "Also on eBay". */
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const adFree = usePremium();
  const shown = links.filter((l) => !(adFree && l.promo));
  if (shown.length === 0) return null;

  if (variant === "strip") {
    return (
      <aside aria-label={heading} data-ebay-panel="strip" className={`not-prose ${className ?? ""}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[#0064d2]/40 bg-[#0064d2]/[0.07] px-4 py-3 text-sm">
          <PaidLinkTag />
          <span className="min-w-0 flex-1 basis-52 text-slate-300">{heading}</span>
          {shown.map((l, i) => (
            <OutboundLink
              key={l.href}
              href={l.href}
              retailer="ebay_search"
              country={country}
              pageType={pageType}
              surface="ebay_panel"
              positionInList={i + 1}
              className="btn-ebay shrink-0 px-3 py-1.5 text-xs"
            >
              {l.label}
            </OutboundLink>
          ))}
        </div>
        {sub && <p className="mt-1 text-[11px] leading-snug text-slate-500">{sub}</p>}
        <AffiliateDisclosure partner="ebay" tight />
      </aside>
    );
  }

  return (
    <section aria-label={heading} data-ebay-panel="panel" className={`card-surface overflow-hidden ${className ?? ""}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-800 px-4 py-3">
        <PaidLinkTag />
        {headingLevel === 3 ? (
          <h3 className="text-base font-extrabold text-white">{heading}</h3>
        ) : (
          <h2 className="text-base font-extrabold text-white">{heading}</h2>
        )}
      </div>
      {sub && <p className="px-4 pt-3 text-xs leading-relaxed text-slate-400">{sub}</p>}
      <ul className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
        {shown.map((l, i) => (
          <li key={l.href}>
            <OutboundLink
              href={l.href}
              retailer="ebay_search"
              country={country}
              pageType={pageType}
              surface="ebay_panel"
              positionInList={i + 1}
              className="btn-ebay-ghost w-full justify-between text-left"
            >
              <span className="min-w-0">{l.label}</span>
              <span aria-hidden className="shrink-0">→</span>
            </OutboundLink>
          </li>
        ))}
      </ul>
      <div className="border-t border-ink-800 px-4 py-2.5">
        <AffiliateDisclosure partner="ebay" tight className="mt-0" />
      </div>
    </section>
  );
}
