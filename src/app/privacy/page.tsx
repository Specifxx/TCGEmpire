import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME, SITE_URL } from "@/lib/site";
import { staticPageDateLabel } from "@/lib/static-page-dates";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${SITE_NAME} handles your data, cookies and third-party advertising.`,
  alternates: { canonical: "/privacy" },
};


export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl">
      {/* Visible trail + BreadcrumbList JSON-LD. Every indexable page needs
          both — the crawl check asserts it. */}
      <Breadcrumbs trail={[{ name: "Privacy policy", href: "/privacy" }]} />
      <h1 className="text-3xl font-extrabold leading-tight text-white">Privacy Policy</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: {staticPageDateLabel("/privacy")}</p>

      <div className="mt-6 space-y-6 border-t border-ink-800 pt-6 text-sm leading-relaxed text-slate-300">
        <p>
          This Privacy Policy explains how {SITE_NAME} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) collects,
          uses and protects information when you visit{" "}
          <a href={SITE_URL} className="text-brand-400 hover:underline">{SITE_URL}</a>{" "}
          (the &ldquo;Site&rdquo;). By using the Site you agree to the practices described here.
        </p>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Information we collect</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-white">Account information</strong> — if you register, we store
              the email address and a securely hashed password you provide.
            </li>
            <li>
              <strong className="text-white">Usage data</strong> — pages viewed, searches, clicks and
              similar interactions, collected to operate and improve the Site.
            </li>
            <li>
              <strong className="text-white">Device &amp; log data</strong> — your browser type,
              approximate region and IP address, as standard for any website.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Cookies</h2>
          <p>
            We use cookies and similar technologies for three distinct purposes:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-white">Strictly necessary</strong> — keeping you signed in and
              remembering preferences such as your selected country. These are set without consent
              because the Site cannot function without them.
            </li>
            <li>
              <strong className="text-white">Analytics</strong> — measuring aggregate traffic and
              page performance (see Analytics below).
            </li>
            <li>
              <strong className="text-white">Advertising</strong> — set by Google and its
              advertising partners to serve and measure ads, including personalised ads where you
              have consented.
            </li>
          </ul>
          <p>
            Analytics and advertising cookies are only set after consent where consent is required.
            You can disable cookies entirely in your browser settings, though parts of the Site may
            stop working as expected.
          </p>
        </section>

        {/* PRESENT TENSE, DELIBERATELY. This section previously said, as a fact,
            that the Site served no third-party advertising and set no advertising
            cookies — while an AdSense application was live. A privacy policy that
            contradicts the ad code on the page is a direct AdSense Publisher
            Policy problem ("Privacy policy disclosures") and a bad look for any
            reviewer who reads both. It now describes what the Site actually does.
            See docs/adsense-remediation.md § Phase 10. */}
        <section id="advertising" className="scroll-mt-24 space-y-2">
          <h2 className="text-lg font-bold text-white">Advertising &amp; third-party vendors</h2>
          <p>
            <strong className="text-white">
              We use third-party advertising on this Site, including Google AdSense.
            </strong>{" "}
            RiftCompare is funded by advertising, affiliate commissions (see below), Premium
            subscriptions and marketplace fees.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Third-party vendors, including Google, use cookies to serve ads based on your prior
              visits to this Site and other websites.
            </li>
            <li>
              Google&rsquo;s use of advertising cookies enables it and its partners to serve ads to
              you based on your visit to this Site and/or other sites on the Internet.
            </li>
            <li>
              Where a consent regime applies to you — the EEA, the UK and Switzerland — we ask for
              your consent before any advertising or analytics cookies are set, using Google&rsquo;s
              certified consent message. Until you answer it, advertising storage, ad
              personalisation, ad user data and analytics storage are all set to <em>denied</em>{" "}
              (Google Consent Mode v2), and any advertising you see is non-personalised. The{" "}
              <strong className="text-white">Privacy settings</strong> link in our footer re-opens
              that message so you can change your answer at any time.
            </li>
            <li>
              If no such regime applies where you are, no consent message is shown and the{" "}
              <strong className="text-white">Privacy settings</strong> footer link brings you to this
              section instead. The opt-out controls below still apply to you, and blocking
              third-party cookies in your browser prevents advertising cookies entirely.
            </li>
            <li>
              You may opt out of personalised advertising by visiting{" "}
              <a
                href="https://www.google.com/settings/ads"
                className="text-brand-400 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Ads Settings
              </a>
              . You can also opt out of some third-party vendors&rsquo; use of cookies at{" "}
              <a
                href="https://www.aboutads.info/choices/"
                className="text-brand-400 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                aboutads.info/choices
              </a>
              .
            </li>
            <li>
              For more on how Google uses data from sites that use its services, see{" "}
              <a
                href="https://policies.google.com/technologies/partner-sites"
                className="text-brand-400 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                How Google uses information from sites or apps that use its services
              </a>
              .
            </li>
            <li>
              <strong className="text-white">Meta (Facebook) Pixel.</strong> We use the Meta Pixel to
              measure visits that arrive from our advertising on Facebook and Instagram, and to build
              audiences for that advertising. It sets Meta&rsquo;s own cookies and reports your visit
              to Meta.{" "}
              <strong className="text-white">
                It does not load unless you have consented to advertising cookies.
              </strong>{" "}
              Where no consent regime applies to you it loads by default; you can prevent it entirely
              by blocking third-party cookies, and you can control how Meta uses the data in your{" "}
              <a
                href="https://www.facebook.com/adpreferences"
                className="text-brand-400 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Meta ad preferences
              </a>
              . See also Meta&rsquo;s{" "}
              <a
                href="https://www.facebook.com/privacy/policy/"
                className="text-brand-400 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                privacy policy
              </a>
              .
            </li>
            <li>
              We also show our own first-party promotional units — plain links to other RiftCompare
              pages. These set no cookies and involve no third party.
            </li>
          </ul>
          <p>
            The native RiftCompare mobile apps use Google AdMob, which is subject to the same Google
            advertising policies and the same opt-out controls linked above.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Affiliate links</h2>
          <p>
            Some outbound links to retailers (such as eBay, Amazon and TCGplayer) are affiliate
            links. If you buy through them we may earn a commission at no extra cost to you. This
            never affects the prices we show or the order in which results appear.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Analytics</h2>
          <p>
            We use privacy-respecting analytics (Vercel Analytics and Speed Insights) to understand
            aggregate traffic and performance. These are cookieless and do not identify you
            personally. Where a consent regime applies to you, they are held back until you consent
            — the same signal that governs advertising, so one answer covers both.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Payments</h2>
          <p>
            Premium subscriptions and Marketplace purchases are processed by{" "}
            <a
              href="https://stripe.com/privacy"
              className="text-brand-400 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Stripe
            </a>
            . Card details are entered on Stripe&rsquo;s systems and are never seen or stored by us —
            we receive only a payment reference, the amount, and whether it succeeded.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">How we use information</h2>
          <p>
            We use the information above to provide and secure the Site, remember your preferences,
            understand how the Site is used, display relevant advertising, and respond to your
            enquiries. We do not sell your personal information.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Your choices</h2>
          <p>
            You can manage cookies in your browser, opt out of personalised ads using the links
            above, and request access to or deletion of your account data by emailing us. Children
            under 13 (or the minimum age in your country) should not use the Site.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Changes to this policy</h2>
          <p>
            We may update this policy from time to time. Material changes will be reflected by the
            &ldquo;last updated&rdquo; date above.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Contact</h2>
          <p>
            Questions about this policy? Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold hover:underline">{CONTACT_EMAIL}</a>{" "}
            or visit our <Link href="/contact" className="text-brand-400 hover:underline">contact page</Link>.
          </p>
        </section>
      </div>
    </article>
  );
}
