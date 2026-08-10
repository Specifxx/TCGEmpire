import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME, SITE_URL } from "@/lib/site";
import { staticPageDateLabel } from "@/lib/static-page-dates";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    `The terms of using ${SITE_NAME}: what our price comparison does and does not guarantee, how ` +
    `affiliate links work, account rules and acceptable use.`,
  alternates: { canonical: "/terms" },
};


export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl">
      {/* Visible trail + BreadcrumbList JSON-LD. Every indexable page needs
          both — the crawl check asserts it. */}
      <Breadcrumbs trail={[{ name: "Terms", href: "/terms" }]} />
      <h1 className="text-3xl font-extrabold leading-tight text-white">Terms of Service</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: {staticPageDateLabel("/terms")}</p>

      <div className="mt-6 space-y-6 border-t border-ink-800 pt-6 text-sm leading-relaxed text-slate-300">
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your use of {SITE_NAME} (the
          &ldquo;Site&rdquo;) at{" "}
          <a href={SITE_URL} className="text-brand-400 hover:underline">{SITE_URL}</a>. By accessing or
          using the Site you agree to these Terms. If you do not agree, please do not use the Site.
        </p>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">1. The service</h2>
          <p>
            {SITE_NAME} provides price-comparison information, a card database, tools and games for the
            Riftbound trading card game. The Site is provided free of charge for personal,
            non-commercial use, except where a paid feature (such as {SITE_NAME} Premium) is clearly
            offered.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">2. Pricing information &amp; accuracy</h2>
          <p>
            Prices, stock levels and other data are gathered from public third-party sources and are
            provided for general information only. They may be delayed, incomplete or inaccurate, and can
            change at any time. {SITE_NAME} does not sell the cards listed (other than through its own
            clearly-identified marketplace, where applicable) and is not responsible for any third-party
            store, its prices, stock, or fulfilment. <strong className="text-white">Always confirm the
            price and availability on the retailer&rsquo;s own website before purchasing.</strong>
          </p>
          <p>
            <strong className="text-white">We are not a party to any transaction between you and a
            third-party retailer.</strong> When you follow a link from {SITE_NAME} and buy from a
            store, the contract is between you and that store alone. Payment, delivery, warranties,
            returns, refunds and disputes are governed by that store&rsquo;s own terms, not ours, and
            we have no authority to intervene in them. (Our own Marketplace, described in 3a below,
            is the one exception and is covered by its own terms.)
          </p>
          <p>
            Prices are recorded snapshots, not live lookups — see our{" "}
            <Link href="/editorial-policy" className="text-brand-400 hover:underline">editorial &amp; pricing policy</Link>{" "}
            for exactly how often each surface refreshes, how listings are verified, and how to
            report a price that is wrong.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">3. Affiliate links &amp; advertising</h2>
          <p>
            The Site is supported by third-party advertising (including Google AdSense), affiliate
            commissions, Premium subscriptions and marketplace fees. Some outbound links are
            affiliate links through which we may earn a commission at no extra cost to you; these
            are marked and disclosed next to the link. Advertising never affects the prices we show
            or the order in which results are ranked. See our{" "}
            <Link href="/privacy" className="text-brand-400 hover:underline">Privacy Policy</Link> for how
            advertising and cookies are handled.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">3a. Marketplace</h2>
          <p>
            {SITE_NAME} Marketplace lets signed-in users buy and sell Riftbound cards directly with each other.
            {SITE_NAME} facilitates these transactions (payment, escrow, tracking, dispute support) as described in
            our dedicated{" "}
            <Link href="/marketplace/terms" className="text-brand-400 hover:underline">Marketplace Terms</Link>,{" "}
            <Link href="/marketplace/buyer-protection" className="text-brand-400 hover:underline">Buyer Protection</Link>, and{" "}
            <Link href="/marketplace/shipping" className="text-brand-400 hover:underline">Shipping &amp; Tracking</Link> pages,
            which apply in addition to these Terms whenever you use the Marketplace.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">4. Accounts</h2>
          <p>
            Some features require an account. You are responsible for keeping your login details secure
            and for activity under your account. Provide accurate information, don&rsquo;t impersonate
            others, and don&rsquo;t share your account. We may suspend or remove accounts that violate
            these Terms.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">5. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>scrape, copy or republish the Site&rsquo;s data in bulk without permission;</li>
            <li>disrupt, overload, or attempt to gain unauthorised access to the Site or its systems;</li>
            <li>post unlawful, misleading, infringing or abusive content where the Site allows submissions;</li>
            <li>use the Site for any unlawful purpose or in breach of these Terms.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">6. User content &amp; moderation</h2>
          <p>
            If you post content on the Site — including Marketplace listings, listing descriptions,
            seller profiles, reviews and messages — you remain responsible for it and grant us a
            non-exclusive licence to display it on the Site.
          </p>
          <p>
            <strong className="text-white">Marketplace listings are moderated.</strong> Listings are
            subject to our{" "}
            <Link href="/marketplace/listing-policy" className="text-brand-400 hover:underline">listing content policy</Link>,
            reviewed against it, and removed when they breach it. Only verified sellers may list.
            Submitted text is stored and rendered as plain text — it is never interpreted as HTML or
            script — so a listing cannot inject markup, styling or code into any page.
          </p>
          <p>
            Anyone can report a listing using the <strong className="text-white">Report listing</strong>{" "}
            control on the listing itself, or by emailing{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold hover:underline">{CONTACT_EMAIL}</a>.
            Reported listings are reviewed and, where they breach the policy, removed; repeat
            breaches cost the seller their selling privileges.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">7. Intellectual property</h2>
          <p>
            Riftbound and League of Legends, and all related card names and artwork, are the property of
            Riot Games and its licensors. {SITE_NAME} is an independent project and is not affiliated
            with, endorsed or sponsored by Riot Games or any store featured. Such material is used only to
            identify the cards being priced.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">8. Premium subscriptions</h2>
          <p>
            Where offered, {SITE_NAME} Premium is billed on a recurring basis through our payment
            provider. You can cancel at any time; access continues until the end of the paid period.
            Fees already paid are non-refundable except where required by law.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">9. Disclaimer &amp; limitation of liability</h2>
          <p>
            The Site is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of
            any kind. To the maximum extent permitted by law, {SITE_NAME} is not liable for any loss
            arising from your use of the Site or reliance on its information, including any purchase you
            make from a third-party store. Nothing in these Terms excludes rights you have under
            applicable consumer law (including the Australian Consumer Law).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">10. Changes</h2>
          <p>
            We may update these Terms from time to time. Material changes are reflected by the &ldquo;last
            updated&rdquo; date above; continued use of the Site means you accept the updated Terms.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">11. Contact</h2>
          <p>
            Questions about these Terms? Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold hover:underline">{CONTACT_EMAIL}</a>{" "}
            or visit the <Link href="/contact" className="text-brand-400 hover:underline">contact page</Link>.
          </p>
        </section>
      </div>
    </article>
  );
}
