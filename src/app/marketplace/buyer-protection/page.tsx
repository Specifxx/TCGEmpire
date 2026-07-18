import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";
import { MARKETPLACE_AUTO_RELEASE_DAYS, MARKETPLACE_SHIP_DEADLINE_DAYS } from "@/lib/marketplace";

export const metadata: Metadata = {
  title: "Buyer Protection",
  description: `How ${SITE_NAME} Marketplace protects buyers — held funds, tracking, and dispute support.`,
  alternates: { canonical: "/marketplace/buyer-protection" },
};

export default function BuyerProtectionPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-extrabold leading-tight text-white">🛡️ Buyer Protection</h1>
      <p className="mt-2 text-sm text-slate-500">How your payment is protected on {SITE_NAME} Marketplace.</p>

      <div className="mt-6 space-y-6 border-t border-ink-800 pt-6 text-sm leading-relaxed text-slate-300">
        <div className="card-surface border-brand-500/30 p-5">
          <p className="text-base font-semibold text-white">
            🔒 Your payment is held until delivery is confirmed. The seller is only paid out afterwards.
          </p>
        </div>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">How it works</h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>You pay securely by card through Stripe at checkout. The charge goes to {SITE_NAME}, not directly to the seller.</li>
            <li>The seller has {MARKETPLACE_SHIP_DEADLINE_DAYS} business days to ship your order and enter tracking. If they don't, your order is automatically cancelled and refunded in full — no need to ask.</li>
            <li>Once shipped, you get a tracking link straight to the carrier's own tracking page.</li>
            <li>When your order arrives, confirm delivery in <Link href="/marketplace/orders" className="text-brand-400 hover:underline">My orders</Link> — this releases the held funds to the seller.</li>
            <li>
              If you don't confirm, our team checks the tracking themselves and releases funds once it genuinely
              shows delivered — sellers can never confirm their own delivery to release their own payout. If nobody
              (you or an admin) has acted within {MARKETPLACE_AUTO_RELEASE_DAYS} days of shipping, funds release
              automatically as a backstop, so a seller isn't left waiting indefinitely.
            </li>
          </ol>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">If something goes wrong</h2>
          <p>
            If your order doesn't arrive, arrives damaged, or isn't as described, use the{" "}
            <strong className="text-white">Report a problem</strong> button on the order (or{" "}
            <Link href="/support" className="text-brand-400 hover:underline">open a support ticket</Link> directly).
            This immediately pauses any automatic release of funds so nothing pays out while we look into it. Our team
            reviews reported orders and can refund you from the held balance where the claim is valid.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">What's covered</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Item never arrives (no valid tracking showing delivery).</li>
            <li>Item is significantly not as described (wrong card, wrong condition, wrong foil status).</li>
            <li>Item arrives damaged due to inadequate packaging.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">What isn't covered</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Buyer's remorse after confirming delivery and releasing funds.</li>
            <li>Minor condition differences reasonably within the listed condition grade.</li>
            <li>Delays caused by the postal carrier once tracking shows the parcel in transit (contact the carrier directly, and let us know if it's genuinely lost).</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Full terms</h2>
          <p>
            This page is a plain-language summary. The full legal terms are in our{" "}
            <Link href="/marketplace/terms" className="text-brand-400 hover:underline">Marketplace Terms</Link>, and
            details on shipping and tracking are in our{" "}
            <Link href="/marketplace/shipping" className="text-brand-400 hover:underline">Shipping &amp; Tracking</Link> page.
            Questions? Email <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold hover:underline">{CONTACT_EMAIL}</a>.
          </p>
        </section>
      </div>
    </article>
  );
}
