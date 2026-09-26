import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME, SITE_URL, TIER_NAMES, INTRO_MONTHS, introOfferEnabled } from "@/lib/site";
import { PREMIUM_TRIAL_DAYS } from "@/lib/premium";
import { staticPageDateLabel } from "@/lib/static-page-dates";
import { pageAlternates } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    `The terms of using ${SITE_NAME}: what our price comparison does and does not guarantee, how ` +
    `affiliate links work, account rules and acceptable use.`,
  alternates: pageAlternates("/terms"),
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
            commissions and Premium subscriptions. Some outbound links are
            affiliate links through which we may earn a commission at no extra cost to you; these
            are marked and disclosed next to the link. Advertising never affects the prices we show
            or the order in which results are ranked. See our{" "}
            <Link href="/privacy" className="text-brand-400 hover:underline">Privacy Policy</Link> for how
            advertising and cookies are handled.
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
            If you post content on the Site — including reviews, feedback, store suggestions and
            messages — you remain responsible for it and grant us a non-exclusive licence to display
            it on the Site.
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
              checkout reads, never typed here. Since 2026-09-26 both are off
              by default (PREMIUM_TRIAL_DAYS 0, NEXT_PUBLIC_PREMIUM_INTRO_OFFER
              unset), so neither paragraph renders: checkout charges at once. */}
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
          {/* "Your price" rewritten 2026-09-26: it said "we do not move existing
              subscribers onto a new price", which stopped being true the day
              the owner cut both plans' prices and moved existing subscribers
              DOWN onto them from their next renewal (DECISIONS.md, 2026-09-26).
              The no-rise half is unchanged and still holds. */}
          <p>
            <strong className="text-white">Your price.</strong> The price you subscribe at does not rise for as
            long as your subscription stays active. If we lower a plan&apos;s price, we may move existing
            subscribers onto the lower price from their next renewal; we never move them onto a higher one. If a
            subscription ends and you subscribe again later, the price at that time applies.
          </p>
          {/* The trial clauses here are worded "if you are in a free trial"
              rather than hidden with the trial switch: trials started before
              2026-09-26 are still running when the offer itself is off. */}
          <p>
            <strong className="text-white">Changing or cancelling.</strong> You can cancel at any time from your
            account; access continues until the end of the period already paid for (or, if you are in a free
            trial, until the trial ends). Once a subscription is paid, moving from {TIER_NAMES.plus} to{" "}
            {TIER_NAMES.premium} bills the prorated difference straight away, and moving down credits the unused
            part of the period against your next invoice; plan changes are not available during a free trial.
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
