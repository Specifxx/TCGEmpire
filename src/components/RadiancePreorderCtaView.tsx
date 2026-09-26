"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCountry } from "./CountryProvider";
import { NewsletterSignup } from "./NewsletterSignup";
import { OutboundLink } from "./OutboundLink";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { formatMoney } from "@/lib/format";
import { currencyOf } from "@/lib/country";
import { ebayLabel, ebaySearchUrl } from "@/lib/affiliate";
import { trackEvent } from "@/lib/analytics";
import { readEntrySource } from "@/lib/entry-source";
import type { RadianceBoxPrices } from "@/lib/radiance-cta";

// Client half of RadiancePreorderCta: picks the VISITOR's market from the
// prices the server read for every market. A market with no open Booster Box
// pre-order gets the same link without a number — never another market's.
export function RadiancePreorderCtaView({
  prices,
  placement,
  withSignup,
}: {
  prices: RadianceBoxPrices;
  placement: "top" | "section";
  withSignup: boolean;
}) {
  const { country } = useCountry();
  const cents = prices[country];
  const from = cents != null ? formatMoney(cents, currencyOf(country)) : null;

  return (
    <aside aria-label="Radiance pre-orders" data-radiance-cta={placement} className="not-prose my-6">
      <Link
        href="/radiance-preorders"
        // The article → pre-order hop is the funnel step this block exists
        // for, and nothing measured it: GA4's page_referrer shows it only in
        // an exploration, and Vercel not at all. A click, so low-volume —
        // it stays dual-destination (lib/analytics.ts GA4_ONLY_EVENTS).
        onClick={() => trackEvent("preorder_cta_click", { placement, has_price: from != null, entry: readEntrySource() })}
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-slate-200 hover:border-gold/70"
      >
        <span>
          <strong className="text-gold">Radiance booster box pre-orders</strong>
          {from ? (
            <>
              {" "}
              from <strong className="num text-white">{from}</strong>
            </>
          ) : null}
          <span className="text-slate-400"> · releases 23 Oct 2026</span>
        </span>
        <span className="shrink-0 font-semibold text-gold">Compare every store →</span>
      </Link>
      {/* The "top" placement stays internal-only: it sits above the TL;DR, and
          an affiliate line there would lead the post with a paid link. */}
      {placement === "section" && <RadianceCtaEbayLine />}
      {withSignup && (
        <div className="mt-3">
          <NewsletterSignup
            siteName="RiftCompare"
            variant="card"
            source="radiance-launch"
            trackEvent="radiance_notify_click"
            heading="Get an email the day Radiance prices go live"
            cta="Notify me"
            done="You're on the list. We'll email you on release day."
            button="ghost"
          />
        </div>
      )}
    </aside>
  );
}

// The eBay line under the CTA's "section" placement (2026-09-26, "Pushing eBay
// clicks" in DECISIONS.md). A SIBLING of the pre-order link, never inside it:
// the link above compares stores and this is a plain search of eBay for the
// reader who would rather buy there, with its disclosure directly under it.
// Client-side so it follows the visitor's market on the ISR article pages,
// which never read a cookie on the server. After release (`released`, from
// RadiancePreorderCta's post-release branch) there is nothing left to
// pre-order, so it offers singles only.
//
// page_type follows the path: the same block renders on the Radiance posts and
// on /sets/radiance, and a set-page click must not report as an article's.
export function RadianceCtaEbayLine({ released = false }: { released?: boolean }) {
  const { country } = useCountry();
  const pathname = usePathname() ?? "";
  const label = ebayLabel(country);
  return (
    <div data-radiance-cta-ebay className="mt-1">
      <OutboundLink
        href={ebaySearchUrl(country, "Riftbound Radiance", "preorder-cta")}
        retailer="ebay_search"
        country={country}
        pageType={pathname.startsWith("/sets/") ? "set_hub" : "article"}
        surface="preorder_cta_ebay"
        className="tap-link min-h-11 text-sm text-sky-300 underline-offset-2 hover:underline"
      >
        {released
          ? `Or search ${label} for Radiance singles →`
          : `Or search ${label} for Radiance singles and sealed →`}
      </OutboundLink>
      <AffiliateDisclosure partner="ebay" tight />
    </div>
  );
}
