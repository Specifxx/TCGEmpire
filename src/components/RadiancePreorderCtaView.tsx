"use client";

import Link from "next/link";
import { useCountry } from "./CountryProvider";
import { NewsletterSignup } from "./NewsletterSignup";
import { formatMoney } from "@/lib/format";
import { currencyOf } from "@/lib/country";
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
