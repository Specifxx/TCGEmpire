import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME, SITE_URL } from "@/lib/site";
import { MARKETPLACE_PUBLIC } from "@/lib/marketplace";

export const revalidate = 86400;

const UPDATED = "1 August 2026";

export const metadata: Metadata = {
  title: "Marketplace listing content policy",
  description:
    "What may and may not be listed on the RiftCompare Marketplace, how listings are moderated, and how to report one.",
  alternates: { canonical: "/marketplace/listing-policy" },
  // Follows the rest of the marketplace: indexed only once the marketplace is
  // publicly launched, crawlable either way.
  ...(MARKETPLACE_PUBLIC ? {} : { robots: { index: false, follow: true } }),
};

// Phase 10e of the AdSense remediation. Unmoderated user-generated commerce is a
// standing AdSense risk — the reviewer's question is not "is this listing bad?"
// but "does anyone here check?". This page is the answer, and it is linked from
// the Terms, from the marketplace itself, and from every listing's report control.
export default function ListingPolicyPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Marketplace listing content policy",
    url: `${SITE_URL}/marketplace/listing-policy`,
    publisher: { "@id": `${SITE_URL}/#org` },
  };

  return (
    <article className="mx-auto max-w-3xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-slate-400">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link href="/" className="hover:text-white">Home</Link></li>
          <li className="text-ink-700">/</li>
          <li><Link href="/marketplace" className="hover:text-white">Marketplace</Link></li>
          <li className="text-ink-700">/</li>
          <li className="text-slate-300" aria-current="page">Listing content policy</li>
        </ol>
      </nav>

      <h1 className="text-3xl font-extrabold leading-tight text-white">Listing content policy</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: {UPDATED}</p>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
        The {SITE_NAME} Marketplace lets people sell Riftbound cards to each other. This page sets
        out what may be listed, what may not, and what happens when a listing breaks the rules. It
        applies to every part of a listing — the card, the price, the condition, the photos, the
        description, and the seller profile it sits under.
      </p>

      <div className="mt-8 space-y-8 border-t border-ink-800 pt-8 text-sm leading-relaxed text-slate-300">
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">What may be listed</h2>
          <p>
            Genuine, physical Riftbound: League of Legends TCG cards and sealed Riftbound product
            that you own and can post. Nothing else.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">What may not</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong className="text-white">Counterfeits, proxies and reprints</strong> represented as genuine cards, in any condition.</li>
            <li><strong className="text-white">Cards you do not have in hand.</strong> No pre-orders, no &ldquo;arriving next week&rdquo;, no drop-shipping from another shop.</li>
            <li><strong className="text-white">A misdescribed condition.</strong> Grade honestly and photograph real wear. Condition disputes are the most common cause of a refund, and the cost lands on the seller.</li>
            <li><strong className="text-white">Wrong or misleading card identity</strong> — listing a base printing as a Signature or alt-art, or using another printing&rsquo;s photo.</li>
            <li><strong className="text-white">Anything not a Riftbound card or sealed product</strong>, including other games, accessories, services, accounts or digital goods.</li>
            <li><strong className="text-white">Stolen goods</strong>, or anything you are not legally entitled to sell.</li>
            <li><strong className="text-white">Contact details or off-platform payment</strong> in the description — no emails, phone numbers, social handles, or requests to pay by bank transfer or gift card. Off-platform payment removes the buyer protection that makes this marketplace worth using, and is the single most common shape of a scam.</li>
            <li><strong className="text-white">Links or promotional content</strong> for anything other than the card being sold.</li>
            <li><strong className="text-white">Abusive, hateful, sexual, violent or discriminatory content</strong>, in text or images.</li>
            <li><strong className="text-white">Adult, gambling, weapons, drugs, alcohol, tobacco or other regulated goods.</strong></li>
            <li><strong className="text-white">Price manipulation</strong> — coordinated pricing, fake listings intended to move a card&rsquo;s tracked market price, or bidding on your own listings.</li>
            <li><strong className="text-white">Impersonation</strong> of another seller, of {SITE_NAME}, or of Riot Games.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">How listings are moderated</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong className="text-white">Only verified sellers may list.</strong> Selling requires an account with a confirmed email and seller verification — it is not open to anonymous signups.</li>
            <li><strong className="text-white">Listings are checked against this policy</strong>, and reviewed on report. We remove anything that breaches it.</li>
            <li><strong className="text-white">Every listing is tied to a real card record</strong> in our database by set code and collector number, so a listing cannot invent a product that does not exist.</li>
            <li><strong className="text-white">Submitted text is stored and displayed as plain text.</strong> It is never interpreted as HTML, styling or script — a listing cannot inject markup or code into any page on this site.</li>
            <li><strong className="text-white">Payment runs through escrow.</strong> Funds are held until the buyer confirms delivery or the auto-release window passes, so a bad listing can be stopped before money changes hands. See <Link href="/marketplace/buyer-protection" className="text-brand-400 hover:underline">buyer protection</Link>.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">Reporting a listing</h2>
          <p>
            Every listing carries a <strong className="text-white">Report listing</strong> control.
            Use it, or email <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold hover:underline">{CONTACT_EMAIL}</a>{" "}
            with the listing link and what is wrong with it. You do not need an account to report
            something, and you do not need to be the buyer.
          </p>
          <p>
            We review reports and act on the ones that stand up. If you have already paid and
            something is wrong with the item, open a dispute through your order instead — that
            route is protected by escrow and is faster.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">What happens when a listing breaches this policy</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>The listing is removed.</li>
            <li>Where an order is already open, it is refunded from escrow.</li>
            <li>Repeat or deliberate breaches cost the seller their selling privileges. Fraud and counterfeits cost them their account on the first occurrence.</li>
          </ul>
          <p>
            These Terms apply alongside our{" "}
            <Link href="/marketplace/terms" className="text-brand-400 hover:underline">Marketplace Terms</Link> and{" "}
            <Link href="/terms" className="text-brand-400 hover:underline">site Terms</Link>.
          </p>
        </section>
      </div>
    </article>
  );
}
