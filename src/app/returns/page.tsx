import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME, SITE_URL } from "@/lib/site";
import { MARKETPLACE_AUTO_RELEASE_DAYS, MARKETPLACE_SHIP_DEADLINE_DAYS } from "@/lib/marketplace";
import { MARKETPLACE_LAUNCH_COUNTRIES } from "@/lib/marketplace-countries";
import { COUNTRIES, type Country } from "@/lib/country";
import { pageAlternates } from "@/lib/seo";

// Store Return & Shipping Policy — the CONVENTIONAL-RETAIL restatement of the
// same rules the Buyer Protection and Shipping & Tracking pages describe in
// marketplace/escrow language.
//
// WHY A SEPARATE PAGE: Google Merchant Center, Shopping ads and third-party
// price-comparison platforms all expect a standard e-commerce return policy —
// a return window in days, who pays return postage, any restocking fee, and the
// accepted reasons — stated in retail terms. "Funds are held until delivery is
// confirmed, then released to the seller" is accurate but is not a format those
// systems can parse, and Merchant Center's Diagnostics flags an account with no
// conventional policy page. This page says the same thing in the expected shape.
//
// EVERY NUMBER HERE IS THE CONSTANT THE CODE ACTUALLY ENFORCES, imported rather
// than written out, so the published policy cannot drift from real behaviour:
//   - the claim window is MARKETPLACE_AUTO_RELEASE_DAYS (lib/marketplace-policy),
//     the same value that drives automatic payout release;
//   - the dispatch deadline is MARKETPLACE_SHIP_DEADLINE_DAYS, the same value the
//     marketplace-maintenance cron uses to auto-cancel unshipped orders.
// Two further statements are verified against the code rather than asserted:
//   - "full refund incl. original postage" — Order.totalCents is set to
//     `lineItemCents + sellerShip` at checkout (api/marketplace/stripe/checkout),
//     and every refund path refunds totalCents;
//   - "no restocking fee" — no code path anywhere deducts one; refundOrder() and
//     refundOrderBySeller() both refund in full.
export const metadata: Metadata = {
  title: "Store Return & Shipping Policy",
  description:
    `Returns, refunds and shipping for orders placed on ${SITE_NAME}: a ${MARKETPLACE_AUTO_RELEASE_DAYS}-day return window, ` +
    "free return postage, no restocking fee, and a full refund including original shipping.",
  alternates: pageAlternates("/returns"),
  openGraph: {
    title: `Store Return & Shipping Policy | ${SITE_NAME}`,
    description: `${MARKETPLACE_AUTO_RELEASE_DAYS}-day returns, free return postage, no restocking fee, full refunds including original shipping.`,
    url: `${SITE_URL}/returns`,
  },
};

const COVERED = [
  "The order never arrived, or tracking does not show delivery.",
  "The item is not as described — wrong card, wrong set or collector number, wrong condition grade, or wrong foil/non-foil.",
  "The item arrived damaged, including damage caused by inadequate packaging.",
  "The item is materially different from the photographs or listing details.",
  "The order was never dispatched within the seller's dispatch deadline.",
];

const NOT_COVERED = [
  "Change of mind after you have confirmed delivery and the order has completed.",
  "Minor condition variation that still falls reasonably within the listed condition grade.",
  "Carrier delays once tracking shows the parcel in transit — contact the carrier first, and tell us if it is genuinely lost.",
];

export default function ReturnsPage() {
  const countryNames = MARKETPLACE_LAUNCH_COUNTRIES.map((c) => COUNTRIES[c as Country].label);

  // MerchantReturnPolicy is the schema.org type Google Merchant Center and
  // Shopping surfaces read. Every value below mirrors the prose on this page and
  // the constants above — never state a term in markup that the page doesn't show.
  const returnPolicyLd = {
    "@context": "https://schema.org",
    "@type": "MerchantReturnPolicy",
    "@id": `${SITE_URL}/returns#policy`,
    name: "Store Return & Shipping Policy",
    url: `${SITE_URL}/returns`,
    merchantReturnLink: `${SITE_URL}/returns`,
    applicableCountry: MARKETPLACE_LAUNCH_COUNTRIES.map((c) => c === "UK" ? "GB" : c),
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: MARKETPLACE_AUTO_RELEASE_DAYS,
    returnMethod: "https://schema.org/ReturnByMail",
    returnFees: "https://schema.org/FreeReturn",
    refundType: "https://schema.org/FullRefund",
    restockingFee: { "@type": "MonetaryAmount", value: 0, currency: "USD" },
    inStoreReturnsOffered: false,
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Returns & Shipping", item: `${SITE_URL}/returns` },
    ],
  };

  return (
    <article className="mx-auto max-w-3xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([returnPolicyLd, breadcrumbLd]) }}
      />

      <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-slate-300">Home</Link>
        <span>/</span>
        <span className="text-slate-300">Returns &amp; Shipping</span>
      </nav>

      <h1 className="text-3xl font-extrabold leading-tight text-white">Store Return &amp; Shipping Policy</h1>
      <p className="mt-2 text-sm text-slate-500">
        Returns, refunds and delivery for orders placed through {SITE_NAME}. Last reviewed 29 July 2026.
      </p>

      {/* At-a-glance summary table — the four facts Merchant Center, Shopping ads
          and comparison platforms look for, stated in plain retail terms. */}
      <div className="card-surface mt-6 overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-ink-800">
            <tr>
              <th scope="row" className="w-1/2 px-4 py-3 text-left font-semibold text-slate-300">Return window</th>
              <td className="px-4 py-3 text-white">{MARKETPLACE_AUTO_RELEASE_DAYS} days from dispatch</td>
            </tr>
            <tr>
              <th scope="row" className="px-4 py-3 text-left font-semibold text-slate-300">Who pays return shipping</th>
              <td className="px-4 py-3 text-white">We do — returns are free to you</td>
            </tr>
            <tr>
              <th scope="row" className="px-4 py-3 text-left font-semibold text-slate-300">Restocking fee</th>
              <td className="px-4 py-3 text-white">None</td>
            </tr>
            <tr>
              <th scope="row" className="px-4 py-3 text-left font-semibold text-slate-300">Refund amount</th>
              <td className="px-4 py-3 text-white">Full purchase price, including the original postage you paid</td>
            </tr>
            <tr>
              <th scope="row" className="px-4 py-3 text-left font-semibold text-slate-300">Refund method</th>
              <td className="px-4 py-3 text-white">Back to your original payment card</td>
            </tr>
            <tr>
              <th scope="row" className="px-4 py-3 text-left font-semibold text-slate-300">Where we ship</th>
              <td className="px-4 py-3 text-white">{countryNames.join(", ")} (domestic delivery within each country)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-8 space-y-8 border-t border-ink-800 pt-8 text-sm leading-relaxed text-slate-300">
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Your return window</h2>
          <p>
            You have <strong className="text-white">{MARKETPLACE_AUTO_RELEASE_DAYS} days from the date your order is
            dispatched</strong> to request a return or refund. Requesting one within that window puts your order on
            hold immediately, so nothing is finalised while we review it.
          </p>
          <p>
            If your parcel is delayed in transit and arrives near the end of that window, contact us and we will extend
            it — the window exists to stop orders hanging open indefinitely, not to time you out of a genuine problem.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">What you can return</h2>
          <p>We accept returns and issue refunds for any of the following:</p>
          <ul className="list-disc space-y-1 pl-5">
            {COVERED.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">What we cannot accept</h2>
          <p>
            Trading-card singles are graded, individually-photographed items, so a few situations fall outside this
            policy:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {NOT_COVERED.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <p>
            If you are unsure whether your situation qualifies, ask us anyway — we would rather look at it than have you
            assume it is not covered.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">How to start a return</h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Open <Link href="/marketplace/orders" className="text-brand-400 hover:underline">your orders</Link> and
              select the order in question, then choose <strong className="text-white">Report a problem</strong>. You
              can also <Link href="/support" className="text-brand-400 hover:underline">contact support</Link> directly.
            </li>
            <li>Tell us what went wrong and attach photographs where the item arrived damaged or is not as described.</li>
            <li>
              We review the request. Where a physical return is needed, we arrange it and cover the postage —{" "}
              <strong className="text-white">you are never asked to pay to send an item back</strong>. For many
              low-value or damaged cards no return is necessary at all, and we simply refund you.
            </li>
            <li>
              Once approved, your refund is issued to the original payment card. Card refunds typically appear within
              5&ndash;10 business days, depending on your bank.
            </li>
          </ol>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Cancelling an order</h2>
          <p>
            You can request to cancel any order that has not yet been delivered, directly from{" "}
            <Link href="/marketplace/orders" className="text-brand-400 hover:underline">your orders</Link>. Cancelled
            orders are refunded in full, including postage. Orders that are not dispatched within{" "}
            {MARKETPLACE_SHIP_DEADLINE_DAYS} business days of payment are cancelled and refunded automatically — you do
            not have to chase them.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Shipping &amp; delivery</h2>
          <p>
            Orders are dispatched within {MARKETPLACE_SHIP_DEADLINE_DAYS} business days of payment and ship domestically
            within your own country — we do not ship across borders, so there are no customs charges, import duties or
            currency conversion to deal with. Delivery is available in {countryNames.join(", ")}.
          </p>
          <p>
            Postage is charged at a flat rate shown on every listing before you buy, and some orders qualify for free
            postage above a threshold. Once your order ships you receive a tracking number and a direct link to the
            carrier&apos;s own tracking page, along with an estimated delivery window.
          </p>
          <p>
            All cards are packed protectively for their value — at minimum a sleeve and a rigid toploader or mailer
            inside a bend-resistant envelope. Damage resulting from inadequate packaging is covered by this policy.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Prices shown elsewhere on this site</h2>
          <p>
            {SITE_NAME} is primarily a price-comparison service. Most prices on the site are live listings at{" "}
            <Link href="/stores/tracked" className="text-brand-400 hover:underline">independent retailers we track</Link>,
            and clicking through to buy from one of those stores means their own returns and shipping policy applies,
            not this one. <strong className="text-white">This policy covers orders you place and pay for on{" "}
            {SITE_NAME} itself.</strong>
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Statutory rights</h2>
          <p>
            Nothing in this policy limits your rights under consumer law in your country, including the Australian
            Consumer Law, the UK Consumer Rights Act, the New Zealand Consumer Guarantees Act, and applicable US state
            and federal consumer protection law. Where those rights are broader than this policy, they apply.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Related pages</h2>
          <p>
            The same protections are described in escrow terms on our{" "}
            <Link href="/marketplace/buyer-protection" className="text-brand-400 hover:underline">Buyer Protection</Link>{" "}
            page, with delivery detail on{" "}
            <Link href="/marketplace/shipping" className="text-brand-400 hover:underline">Shipping &amp; Tracking</Link>.
            The binding legal terms are in our{" "}
            <Link href="/marketplace/terms" className="text-brand-400 hover:underline">Marketplace Terms</Link> and{" "}
            <Link href="/terms" className="text-brand-400 hover:underline">Site Terms</Link>.
          </p>
          <p>
            Questions about a specific order? Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold hover:underline">{CONTACT_EMAIL}</a> or{" "}
            <Link href="/support" className="text-brand-400 hover:underline">open a support ticket</Link>.
          </p>
        </section>
      </div>
    </article>
  );
}
