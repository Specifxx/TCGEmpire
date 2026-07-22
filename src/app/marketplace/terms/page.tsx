import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME, SITE_URL } from "@/lib/site";
import { MARKETPLACE_FEE_BPS, MARKETPLACE_PREMIUM_FEE_BPS, MARKETPLACE_SHIP_DEADLINE_DAYS, MARKETPLACE_AUTO_RELEASE_DAYS, MARKETPLACE_LAUNCH_COUNTRIES } from "@/lib/marketplace";

export const metadata: Metadata = {
  title: "Marketplace Terms",
  description: `The terms for buying and selling on ${SITE_NAME} Marketplace.`,
  alternates: { canonical: "/marketplace/terms" },
};

const UPDATED = "18 July 2026";
const FEE_PCT = (MARKETPLACE_FEE_BPS / 100).toFixed(0);
const PREMIUM_FEE_PCT = (MARKETPLACE_PREMIUM_FEE_BPS / 100).toFixed(0);

export default function MarketplaceTermsPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-extrabold leading-tight text-white">Marketplace Terms</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: {UPDATED} — supplements the main <Link href="/terms" className="text-brand-400 hover:underline">Terms of Service</Link>.</p>

      <div className="mt-6 space-y-6 border-t border-ink-800 pt-6 text-sm leading-relaxed text-slate-300">
        <p>
          These Marketplace Terms govern buying and selling on {SITE_NAME} Marketplace (&ldquo;Marketplace&rdquo;),
          reachable at <Link href="/marketplace" className="text-brand-400 hover:underline">{SITE_URL}/marketplace</Link>.
          By listing a card for sale, or by buying one, you agree to these terms in addition to the main{" "}
          <Link href="/terms" className="text-brand-400 hover:underline">Terms of Service</Link>.
        </p>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">1. {SITE_NAME} is a marketplace facilitator, not the seller</h2>
          <p>
            Every listing on the Marketplace is created and fulfilled by an individual seller — a fellow RiftCompare
            user, not {SITE_NAME} itself (except listings explicitly marked &ldquo;Official Store&rdquo;). {SITE_NAME}
            facilitates the transaction — payment processing, escrow, order tracking, and dispute support — but does
            not own, inspect, or ship the cards. The contract of sale is between the buyer and the seller.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">2. Who can sell</h2>
          <p>
            Any signed-in user with a verified email may create a shop and list cards for sale, once they've completed
            payout setup through our payment processor, Stripe. Stripe verifies your identity as part of that setup —
            this is how the Marketplace confirms who its sellers are, without {SITE_NAME} collecting or storing ID
            documents itself. New sellers are subject to listing limits until they've completed a handful of sales (see
            your seller dashboard for current limits) — this protects buyers while a seller builds a track record.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">3. Launch markets</h2>
          <p>
            At launch, the Marketplace operates in {MARKETPLACE_LAUNCH_COUNTRIES.join(", ")} only. Listings are visible
            and purchasable only within a single seller&rsquo;s own market — a buyer in one of these markets can only
            buy from a seller shipping within that same market. Cross-border listings and purchases are planned for a
            future update.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">4. Fees</h2>
          <p>
            {SITE_NAME} charges a {FEE_PCT}% platform fee on the item price of every completed Marketplace sale,
            deducted from the seller&rsquo;s payout — buyers never see an added fee at checkout. Sellers with an active{" "}
            <Link href="/premium" className="text-brand-400 hover:underline">Premium</Link> subscription pay a reduced{" "}
            {PREMIUM_FEE_PCT}% instead, evaluated at the moment of each sale. Where a seller is
            registered for GST (or an equivalent local tax) on their sales, that remains the seller&rsquo;s own
            responsibility; the platform fee itself may attract GST once {SITE_NAME} is GST-registered, at which point
            this page will be updated with invoicing detail. Payment processing fees charged by Stripe are separate
            and are absorbed by {SITE_NAME}, not deducted again from the seller.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">5. How payment works — held funds</h2>
          <p>
            Buyers pay by card through Stripe at checkout. Funds are held by {SITE_NAME} until the order is confirmed
            delivered — see our <Link href="/marketplace/buyer-protection" className="text-brand-400 hover:underline">Buyer Protection</Link> page
            for exactly how and when. Once released, funds are transferred to the seller&rsquo;s own connected Stripe
            account and paid out to their bank on Stripe&rsquo;s normal payout schedule. {SITE_NAME} does not hold
            seller funds in its own bank account at any point — Stripe is the custodian throughout.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">6. Seller obligations</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>List cards accurately — condition, foil status, and quantity must be correct.</li>
            <li>Ship within {MARKETPLACE_SHIP_DEADLINE_DAYS} business days of payment, using tracked postage, and enter the carrier and tracking number on the order.</li>
            <li>Package cards to survive transit (sleeve/toploader/rigid mailer as appropriate for value).</li>
            <li>Respond to buyer messages and support requests in good faith.</li>
            <li>Not list stolen, counterfeit, or prohibited items (see below).</li>
          </ul>
          <p>
            Orders not marked shipped with valid tracking within {MARKETPLACE_SHIP_DEADLINE_DAYS} business days are
            automatically cancelled and refunded to the buyer in full.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">7. Prohibited items &amp; conduct</h2>
          <p>You may not list or attempt to sell:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>counterfeit, proxy, or reproduction cards, unless clearly and prominently marked as such;</li>
            <li>stolen goods;</li>
            <li>items unrelated to the Riftbound trading card game;</li>
            <li>anything illegal to sell in your jurisdiction.</li>
          </ul>
          <p>
            Attempting to move a transaction off-platform to avoid fees or buyer protection, manipulating reviews, or
            using multiple accounts to evade the new-seller limits, is also prohibited.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">8. Disputes &amp; chargebacks</h2>
          <p>
            If something goes wrong with an order, either party can{" "}
            <Link href="/support" className="text-brand-400 hover:underline">open a support ticket</Link> or use the
            &ldquo;Report a problem&rdquo; button on the order — this pauses any automatic payout or refund until our
            team reviews it. Where a buyer disputes a charge directly with their bank (a chargeback) before funds have
            been released to the seller, the disputed amount is refunded from the held balance. Where a chargeback
            arrives after funds have already been released, {SITE_NAME} bears that loss at launch rather than clawing
            back a seller&rsquo;s payout — repeated chargebacks against a seller&rsquo;s sales may still result in
            suspension.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">9. Reviews</h2>
          <p>
            Buyers may leave a star rating and comment after an order ships. Reviews should reflect genuine
            transactions; fake or coerced reviews may be removed and can result in account suspension.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">10. Suspension &amp; removal</h2>
          <p>
            We may pause a listing, suspend a seller&rsquo;s account, or cancel an order that violates these terms,
            without prior notice where necessary to protect buyers.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">11. Consumer law</h2>
          <p>
            Nothing in these terms limits any right you have under applicable consumer protection law, including the
            Australian Consumer Law, which may give you remedies against a seller in addition to those described here.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">12. Contact</h2>
          <p>
            Questions about these terms, or about the Marketplace generally? Check our{" "}
            <Link href="/marketplace/faq" className="text-brand-400 hover:underline">Marketplace FAQ</Link>, visit{" "}
            <Link href="/support" className="text-brand-400 hover:underline">Support</Link>, or email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold hover:underline">{CONTACT_EMAIL}</a>.
          </p>
        </section>
      </div>
    </article>
  );
}
