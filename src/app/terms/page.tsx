import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME, SITE_URL, TIER_NAMES, INTRO_MONTHS, introOfferEnabled } from "@/lib/site";
import { PREMIUM_TRIAL_DAYS } from "@/lib/premium";
import { STATIC_PAGE_DATES, staticPageDateLabel } from "@/lib/static-page-dates";
import { pageAlternates } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    `The terms of using ${SITE_NAME}: what our price comparison does and does not guarantee, how ` +
    `affiliate links work, accounts, published decks, subscriptions and store consulting.`,
  alternates: pageAlternates("/terms"),
};

// 2026-09-26 ("Blog and tools, joined up" in DECISIONS.md): added the paid store
// consulting sold at /stores/consulting (its refund promise is that page's own),
// player-published decks (/decks, hidden via /api/admin/decks), and the
// twice-daily snapshot basis of every price. No governing-law clause: nothing
// in the repo states a jurisdiction, and choosing one is the owner's call.
export default function TermsPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Terms of Service",
    url: `${SITE_URL}/terms`,
    dateModified: STATIC_PAGE_DATES["/terms"],
    publisher: { "@id": `${SITE_URL}/#org` },
  };

  return (
    <article className="mx-auto max-w-3xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
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
            non-commercial use, except where a paid feature is clearly offered: the {TIER_NAMES.plus} and{" "}
            {TIER_NAMES.premium} subscriptions (section 8) and paid consulting sessions for stores
            (section 9).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">2. Pricing information &amp; accuracy</h2>
          <p>
            Prices, stock levels and other data are gathered from public third-party sources and are
            provided for general information only. They may be delayed, incomplete or inaccurate, and can
            change at any time. {SITE_NAME} does not sell the cards listed and is not responsible for any
            third-party store, its prices, stock, or fulfilment. <strong className="text-white">Always confirm the
            price and availability on the retailer&rsquo;s own website before purchasing.</strong>
          </p>
          <p>
            <strong className="text-white">We are not a party to any transaction between you and a
            third-party retailer.</strong> When you follow a link from {SITE_NAME} and buy from a
            store, the contract is between you and that store alone. Payment, delivery, warranties,
            returns, refunds and disputes are governed by that store&rsquo;s own terms, not ours, and
            we have no authority to intervene in them.
          </p>
          <p>
            Prices are recorded snapshots, not live lookups: store prices are imported twice a day, at
            07:00 and 19:00 UTC, and a price can change or sell out between imports. The price, postage
            and availability shown at the retailer&rsquo;s own checkout are the ones that apply. A delivered
            total appears only where a store publishes its postage, and postage estimated from rates
            measured at a store&rsquo;s checkout (in Best Basket, for example) can differ from what that
            store charges you. See our{" "}
            <Link href="/editorial-policy" className="text-brand-400 hover:underline">editorial &amp; pricing policy</Link>{" "}
            for exactly how often each surface refreshes, how listings are verified, and how to
            report a price that is wrong, and our{" "}
            <Link href="/methodology" className="text-brand-400 hover:underline">methodology</Link> for how
            each figure and tool is calculated.
          </p>
          <p>
            Tools that report demand, price movement or a card&rsquo;s position against a market price
            describe recorded data; none of them predicts a price, and nothing on the Site is financial or
            investment advice.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">3. Affiliate links &amp; advertising</h2>
          <p>
            The Site is supported by third-party advertising (including Google AdSense), affiliate
            commissions (through the eBay Partner Network, TCGplayer&rsquo;s programme on Impact and
            Amazon Associates), {TIER_NAMES.plus} and {TIER_NAMES.premium} subscriptions and paid store
            consulting. Some outbound links are
            affiliate links through which we may earn a commission at no extra cost to you; these
            are marked and disclosed next to the link. None of these affects the prices we show
            or the order in which results are ranked. See our{" "}
            <Link href="/privacy" className="text-brand-400 hover:underline">Privacy Policy</Link> for how
            advertising and cookies are handled.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">4. Accounts</h2>
          <p>
            Some features require an account. You sign in with a Google or Discord account, so keeping
            that account secure keeps yours secure, and you are responsible for activity under your
            account. Don&rsquo;t impersonate others, and don&rsquo;t share your account. We may suspend
            or remove accounts that violate these Terms. To close your account, email us.
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
            If you post content on the Site — including decks you publish, reviews, feedback, store
            suggestions and messages — you remain responsible for it and grant us a non-exclusive,
            royalty-free licence to display it on the Site, including in the page and preview image used
            to share a published deck.
          </p>
          <p>
            <strong className="text-white">Published decks are public.</strong> A deck you publish at{" "}
            <Link href="/decks" className="text-brand-400 hover:underline">/decks</Link> is shown to everyone
            under your display name, with its prices recalculated from current store prices. Publishing is
            limited per account, and we may hide a deck that breaches these Terms. To have a deck you
            published taken down, email us.
          </p>
          <p>
            <strong className="text-white">Submitted content is moderated.</strong> It is reviewed
            and removed if it is unlawful, misleading, infringing, abusive or spam. Submitted text is
            stored and rendered as plain text — it is never interpreted as HTML or script — so it
            cannot inject markup, styling or code into any page.
          </p>
          <p>
            Anyone can report content by emailing{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold hover:underline">{CONTACT_EMAIL}</a>.
            Reported content is reviewed and removed where it breaches these Terms.
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
          {/* Rewritten 2026-09-25 to name both paid tiers and the trial and
              intro rules checkout actually applies (lib/premium.ts: the
              card-gated trial, hasEverPaid / introEligibleFor, the lock-in).
              The trial length and intro months come from the same constants
              checkout reads, never typed here. */}
          <h2 className="text-lg font-bold text-white">8. Plus and Premium subscriptions</h2>
          <p>
            {SITE_NAME} offers two paid plans, {TIER_NAMES.plus} and {TIER_NAMES.premium}, each billed monthly or
            yearly on a recurring basis through our payment provider, Stripe, at the price shown before you
            confirm. The features each plan includes are listed on the{" "}
            <Link href="/premium" className="text-brand-400 hover:underline">Premium page</Link>.
          </p>
          {PREMIUM_TRIAL_DAYS > 0 && (
            <p>
              <strong className="text-white">Free trial.</strong> Where a free trial is offered it lasts{" "}
              {PREMIUM_TRIAL_DAYS} day{PREMIUM_TRIAL_DAYS === 1 ? "" : "s"}, is limited to one per account, and
              requires a payment card to start. Unless you cancel before it ends, the trial converts automatically
              into the plan you chose and your card is charged on the day it ends. If you cancel during the trial,
              you are not charged. We email you a day or two before the trial ends.
            </p>
          )}
          {introOfferEnabled() && (
            <p>
              <strong className="text-white">Introductory price.</strong> If your account has never paid for a
              subscription, a monthly plan&apos;s first {INTRO_MONTHS} invoices are charged at half the normal
              monthly price, applied automatically at checkout; the normal monthly price applies from the invoice
              after that. Annual plans are not discounted. Switching between {TIER_NAMES.plus} and{" "}
              {TIER_NAMES.premium} keeps only the half-price invoices you had left.
            </p>
          )}
          <p>
            <strong className="text-white">Your price.</strong> The price you subscribe at does not rise for as
            long as your subscription stays active; we do not move existing subscribers onto a new price. If a
            subscription ends and you subscribe again later, the price at that time applies.
          </p>
          <p>
            <strong className="text-white">Changing or cancelling.</strong> You can cancel at any time from your
            account; access continues until the end of the period already paid for (or, during a trial, until the
            trial ends). Once a subscription is paid, moving from {TIER_NAMES.plus} to {TIER_NAMES.premium} bills
            the prorated difference straight away, and moving down credits the unused part of the period against
            your next invoice; plan changes are not available during a free trial. Subscription fees
            already paid are non-refundable except where required by law.
          </p>
        </section>

        {/* The refund promise is the consulting page's own FAQ ("15 minutes in
            ... we'll refund the whole thing"); the price and length come from
            lib/consulting.ts on that page, so they are referred to, not typed. */}
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">9. Store consulting</h2>
          <p>
            Stores can book a paid one-to-one consulting session at{" "}
            <Link href="/stores/consulting" className="text-brand-400 hover:underline">/stores/consulting</Link>.
            Its price, length and what it covers are stated on that page before you pay. Payment is taken
            by Stripe, which issues a tax invoice. Each booking is for one session; there is no
            subscription.
          </p>
          <p>
            If, 15 minutes into the session, it isn&rsquo;t worth your time, say so on the call and the
            whole fee is refunded. The session is advice, not a promised result: nobody can guarantee what
            a pricing change does to a store&rsquo;s sales. Booking a session has no effect on how any
            store appears or ranks on the Site, and nothing said in a session is published.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">10. Disclaimer &amp; limitation of liability</h2>
          <p>
            The Site is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of
            any kind. To the maximum extent permitted by law, {SITE_NAME} is not liable for any loss
            arising from your use of the Site or reliance on its information, including any purchase you
            make from a third-party store. Nothing in these Terms excludes rights you have under
            applicable consumer law (including the Australian Consumer Law).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">11. Changes</h2>
          <p>
            We may update these Terms from time to time. Material changes are reflected by the &ldquo;last
            updated&rdquo; date above; continued use of the Site means you accept the updated Terms.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">12. Contact</h2>
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
