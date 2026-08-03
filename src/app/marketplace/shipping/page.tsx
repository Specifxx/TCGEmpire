import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/lib/site";
import { MARKETPLACE_SHIP_DEADLINE_DAYS, MARKETPLACE_LAUNCH_COUNTRIES } from "@/lib/marketplace";
import { CARRIER_LABEL } from "@/lib/tracking";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export const metadata: Metadata = {
  title: "Shipping & Tracking",
  description: `How shipping and tracking work on ${SITE_NAME} Marketplace.`,
  alternates: { canonical: "/marketplace/shipping" },
};

export default function MarketplaceShippingPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <Breadcrumbs
        trail={[
          { name: "Marketplace", href: "/marketplace" },
          { name: "Shipping", href: "/marketplace/shipping" },
        ]}
      />
      <h1 className="text-3xl font-extrabold leading-tight text-white">📦 Shipping &amp; Tracking</h1>
      <p className="mt-2 text-sm text-slate-500">How postage and tracking work on {SITE_NAME} Marketplace.</p>

      <div className="mt-6 space-y-6 border-t border-ink-800 pt-6 text-sm leading-relaxed text-slate-300">
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Same-region delivery, for now</h2>
          <p>
            The Marketplace launches in {MARKETPLACE_LAUNCH_COUNTRIES.join(", ")}. Each seller ships within their own
            market, and buyers can only purchase from a seller in their own market — so there's no cross-border
            customs, currency conversion, or long-haul postage to worry about. Every seller sets their own flat
            shipping fee (or free shipping over a threshold), shown on their listing before you buy.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Tracking, not third-party labels</h2>
          <p>
            Sellers ship using their own preferred method and post office, then enter the carrier and tracking number
            on the order — we support {Object.values(CARRIER_LABEL).slice(0, -1).join(", ")}, and any other carrier as
            "Other". You get a direct link to the carrier's own public tracking page, the same way eBay or a courier
            confirmation email would show it. We don't purchase or print shipping labels on a seller's behalf yet —
            that's a planned improvement once the Marketplace has an Australian Business Number set up for automated
            label purchasing (see our <Link href="/marketplace/terms" className="text-brand-400 hover:underline">Marketplace Terms</Link>).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Shipping deadline</h2>
          <p>
            Sellers must mark an order shipped, with valid tracking, within {MARKETPLACE_SHIP_DEADLINE_DAYS} business
            days of payment. If they don't, the order is automatically cancelled and the buyer refunded in full — see{" "}
            <Link href="/marketplace/buyer-protection" className="text-brand-400 hover:underline">Buyer Protection</Link>.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Packaging</h2>
          <p>
            Sellers are expected to package cards appropriately for their value — at minimum a sleeve and toploader or
            rigid mailer inside a bend-resistant envelope. Damage from inadequate packaging is covered under Buyer
            Protection.
          </p>
        </section>
      </div>
    </article>
  );
}
