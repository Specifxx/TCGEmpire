import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME, SITE_URL, TIER_NAMES } from "@/lib/site";
import { STATIC_PAGE_DATES, staticPageDateLabel } from "@/lib/static-page-dates";
import { pageAlternates } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `What ${SITE_NAME} collects and why: sign-in, alerts and emails, analytics, cookies, advertising, affiliate links and payments, who processes it, and your choices.`,
  alternates: pageAlternates("/privacy"),
};

// ─────────────────────────────────────────────────────────────────────────────
// Rewritten 2026-09-26 ("Blog and tools, joined up" in DECISIONS.md) against
// what the code does today, because the previous version described a password
// sign-in and a marketplace that no longer exist and never named Google
// Analytics. Sources for each section:
//   • sign-in           → lib/oauth.ts (Google + Discord only), the OAuth callback
//   • cookies           → lib/auth.ts, lib/country.ts, lib/theme-shared.ts,
//                         lib/ad-free-boot.ts, lib/referral-cookie.ts,
//                         lib/signup-source-shared.ts
//   • analytics         → lib/ga.ts, ConsentDefaults.tsx, lib/use-consent.ts,
//                         GoogleAnalyticsUser.tsx (opaque id, lib/ga-user-id.ts),
//                         ConsentGatedAnalytics.tsx
//   • email             → lib/email.ts (Resend; Brevo for the account digest),
//                         List-Unsubscribe headers, AlertMute
//   • payments          → Stripe checkout for subscriptions and store consulting
//   • AI                → /api/trade-roast sends the trade's card names and totals
// tests/trust-pages.test.ts pins the cookie names and providers to that code.
export default function PrivacyPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Privacy Policy",
    url: `${SITE_URL}/privacy`,
    dateModified: STATIC_PAGE_DATES["/privacy"],
    publisher: { "@id": `${SITE_URL}/#org` },
  };

  return (
    <article className="mx-auto max-w-3xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
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
          (the &ldquo;Site&rdquo;). {SITE_NAME} is run by one person, its founder (see{" "}
          <Link href="/about#who-runs-riftcompare" className="text-brand-400 hover:underline">who runs RiftCompare</Link>
          ), who is responsible for the information described here. By using the Site you agree to the
          practices described here.
        </p>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Information we collect</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-white">Account information</strong> — you sign in with Google or
              Discord. We receive and store your email address, your display name and, where the
              provider supplies one, your profile picture. We never see your Google or Discord password.
              (Accounts opened before sign-in moved to Google and Discord may still hold the hashed
              password they were created with; it is no longer used to sign in.)
            </li>
            <li>
              <strong className="text-white">What you save</strong> — if you have an account: the cards
              you watch and any target prices, your collection and portfolio, decks you publish, and your
              best game scores.
            </li>
            <li>
              <strong className="text-white">Alerts and newsletters</strong> — if you sign up for a price
              alert, a set release alert or our newsletter, with or without an account, we store your
              email address, what you asked to hear about, your market, and whether you have paused or
              unsubscribed.
            </li>
            <li>
              <strong className="text-white">Things you send us</strong> — contact and feedback messages,
              support tickets, wrong-price reports and store suggestions: what you wrote, and your name
              and email address where you give them.
            </li>
            <li>
              <strong className="text-white">Store consulting bookings</strong> — for a store that books a
              session: the store&rsquo;s name and website, a contact name, email address and market, and
              any goals or preferred times you add. Stripe collects the billing address and any tax number
              for the invoice.
            </li>
            <li>
              <strong className="text-white">Usage data</strong> — pages viewed, searches, clicks and
              similar interactions, collected to operate and improve the Site. When you click through to
              a store we record the store, the market and the page you came from, not who you are, and
              card searches and page views are kept only as anonymous totals per card.
            </li>
            <li>
              <strong className="text-white">Device &amp; log data</strong> — your browser type,
              approximate region and IP address, as standard for any website. Your region is used to
              pick your market and to suggest your delivery region for postage estimates.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Cookies and browser storage</h2>
          <p>
            We use cookies and similar technologies for four distinct purposes:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-white">Strictly necessary and preferences</strong> — set without
              consent because the Site cannot work as expected without them:{" "}
              <code className="rounded bg-ink-800 px-1 text-xs">tcge_session</code> keeps you signed in
              (30 days); <code className="rounded bg-ink-800 px-1 text-xs">oauth_state_*</code> and{" "}
              <code className="rounded bg-ink-800 px-1 text-xs">oauth_next_*</code> protect and complete a
              sign-in (ten minutes); <code className="rounded bg-ink-800 px-1 text-xs">country</code>{" "}
              remembers the market you chose and{" "}
              <code className="rounded bg-ink-800 px-1 text-xs">theme</code> light or dark mode (a year
              each); <code className="rounded bg-ink-800 px-1 text-xs">eur_display</code> remembers whether
              UK store prices are shown in pounds or euros, set when you are placed in the UK market (a
              year);{" "}
              <code className="rounded bg-ink-800 px-1 text-xs">rc_adfree</code> stops ads loading
              for {TIER_NAMES.plus} and {TIER_NAMES.premium} members (a month, renewed while you are one).
            </li>
            <li>
              <strong className="text-white">Sign-up attribution</strong> —{" "}
              <code className="rounded bg-ink-800 px-1 text-xs">rc_ref</code> holds the referral code from
              a link someone shared with you (30 days) and{" "}
              <code className="rounded bg-ink-800 px-1 text-xs">rc_signup_src</code> which sign-up button
              you pressed (30 minutes). Neither identifies you.
            </li>
            <li>
              <strong className="text-white">Analytics</strong> — Google Analytics cookies, set only when
              analytics is allowed (see Analytics below).
            </li>
            <li>
              <strong className="text-white">Advertising and consent</strong> — set by Google and its
              advertising partners to serve and measure ads, including personalised ads where you have
              consented. Where Google&rsquo;s consent message is shown to you, it stores your answer in
              its own cookie.
            </li>
          </ul>
          <p>
            Some conveniences are kept in your browser&rsquo;s local storage instead, on your device — for
            example recent searches, cards you viewed recently, game progress and scores, banners you
            dismissed, and an email address you typed into an alert form so you don&rsquo;t have to type it
            again.
            Analytics and advertising cookies are only set after consent where consent is required. You
            can clear any of this, or disable cookies entirely, in your browser settings, though parts of
            the Site may stop working as expected.
          </p>
        </section>

        {/* PRESENT TENSE, DELIBERATELY. This section previously said, as a fact,
            that the Site served no third-party advertising and set no advertising
            cookies — while an AdSense application was live. A privacy policy that
            contradicts the ad code on the page is a direct AdSense Publisher
            Policy problem ("Privacy policy disclosures") and a bad look for any
            reviewer who reads both. It now describes what the Site actually does.
            See docs/adsense-remediation.md § Phase 10. */}
        <section id="advertising" className="scroll-mt-header space-y-2">
          <h2 className="text-lg font-bold text-white">Advertising &amp; third-party vendors</h2>
          <p>
            <strong className="text-white">
              We use third-party advertising on this Site, including Google AdSense.
            </strong>{" "}
            RiftCompare is funded by advertising, affiliate commissions (see below),{" "}
            {TIER_NAMES.plus} and {TIER_NAMES.premium} subscriptions and paid consulting sessions for
            stores.
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
            never affects the prices we show or the order in which a price comparison is ranked.
          </p>
          <p>
            We are a member of the eBay Partner Network, TCGplayer&rsquo;s affiliate programme (run
            through Impact) and the Amazon Associates programme; as an Amazon Associate we earn from
            qualifying purchases. The tracking tag on an affiliate link tells the retailer which
            RiftCompare page and market the click came from, never who you are. The retailer&rsquo;s own
            privacy policy covers what happens on its site.
          </p>
        </section>

        {/* GA4 was on by default (lib/ga.ts) and not disclosed here at all. The
            two-regime description matches ConsentDefaults.tsx (global denied
            default) and lib/use-consent.ts (grant on TCF purpose 1 inside the
            CMP's scope, after a short grace period outside it; only
            analytics_storage moves). */}
        <section id="analytics" className="scroll-mt-header space-y-2">
          <h2 className="text-lg font-bold text-white">Analytics</h2>
          <p>
            We use Google Analytics 4 to understand how the Site is used — which pages are visited, what
            is searched for, which features and store links are clicked — and Vercel Analytics and Speed
            Insights for aggregate traffic and page performance.
          </p>
          <p>
            Every visit starts with analytics storage set to <em>denied</em> (Google Consent Mode v2).
            Where a consent regime applies to you, it stays that way until you consent through
            Google&rsquo;s consent message; until then Google Analytics receives only cookieless,
            anonymous pings and Vercel&rsquo;s analytics do not load. Where no consent message is shown,
            analytics is switched on a moment after the page loads, and Google Analytics may set its
            cookies.
          </p>
          <p>
            If you are signed in and analytics is allowed, we also send Google Analytics an opaque
            identifier for your account, so visits from your phone and your computer count as one
            person. It is a one-way code derived from your account, never your email address or your
            name, and it is cleared when you sign out. Vercel Analytics and Speed Insights set no
            cookies.
          </p>
        </section>

        <section id="email" className="scroll-mt-header space-y-2">
          <h2 className="text-lg font-bold text-white">Emails we send</h2>
          <p>
            We email you only about things you asked for or that concern your account: price alerts
            (a drop, a target price reached, a card back in stock or newly listed), set release alerts,
            the newsletter if you subscribe, a weekly digest to registered accounts, a welcome email when
            you create an account, messages about a {TIER_NAMES.plus} or {TIER_NAMES.premium} trial or
            subscription, occasional announcements to registered accounts, and replies to anything you
            send us.
          </p>
          <p>
            The weekly newsletter may include one clearly labelled sponsored message. We send it
            ourselves: sponsors never receive your email address or any other information about you, and
            clicking their link is the only way they learn you read it.
          </p>
          <p>
            Emails are delivered through Resend, and the weekly account digest and announcements through
            Brevo. Every alert and newsletter email carries an unsubscribe link, and alert emails also
            support the one-click unsubscribe your email app may show at the top. For price alerts,
            unsubscribing pauses the emails for that address rather than deleting your watches; deleting
            them is a separate &ldquo;Delete all my watches&rdquo; link in the email&rsquo;s footer.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Payments</h2>
          <p>
            {TIER_NAMES.plus} and {TIER_NAMES.premium} subscriptions and store consulting sessions are
            processed by{" "}
            <a
              href="https://stripe.com/privacy"
              className="text-brand-400 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Stripe
            </a>
            . Card details are entered on Stripe&rsquo;s systems and are never seen or stored by us —
            we receive only a payment reference, the amount, and whether it succeeded, plus, for a
            consulting session, a link to the invoice Stripe generates.
          </p>
        </section>

        <section id="processors" className="scroll-mt-header space-y-2">
          <h2 className="text-lg font-bold text-white">Who processes your data</h2>
          <p>We rely on these services to run the Site, each for the part named:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong className="text-white">Vercel</strong> — hosting, and Vercel Analytics and Speed Insights.</li>
            <li><strong className="text-white">Neon</strong> — the database that stores accounts, alerts and prices.</li>
            <li><strong className="text-white">Google</strong> — sign-in, Google Analytics, AdSense and its consent message.</li>
            <li><strong className="text-white">Discord</strong> — sign-in.</li>
            <li><strong className="text-white">Stripe</strong> — payments and invoices.</li>
            <li><strong className="text-white">Resend and Brevo</strong> — sending email.</li>
            <li>
              <strong className="text-white">Anthropic or Google</strong> — only if you ask the Trade
              Gremlin on the <Link href="/trade" className="text-brand-400 hover:underline">trade calculator</Link>{" "}
              for its verdict: the card names and totals of that trade are sent to an AI model to write
              the joke. Nothing that identifies you is included.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">How we use information</h2>
          <p>
            We use the information above to provide and secure the Site, remember your preferences,
            send the emails you asked for, understand how the Site is used, display relevant
            advertising, and respond to your enquiries. We do not sell your personal information.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Keeping and deleting your information</h2>
          <p>
            Account data, what you save and your alert subscriptions are kept while your account or
            subscription is active. You can ask us for a copy of the personal information we hold about
            you, ask us to correct it, or ask us to delete it — your account, your alerts, anything you
            sent us, or everything linked to your email address — by emailing{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold hover:underline">{CONTACT_EMAIL}</a>.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Your choices</h2>
          <p>
            You can manage cookies in your browser, change your consent answer with the Privacy settings
            link in the footer, opt out of personalised ads using the links above, and unsubscribe from
            any email from the email itself. Children under 13 (or the minimum age in your country)
            should not use the Site.
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
