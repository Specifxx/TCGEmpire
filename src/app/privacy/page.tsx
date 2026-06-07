import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${SITE_NAME} handles your data, cookies and third-party advertising.`,
  alternates: { canonical: "/privacy" },
};

// Plain "last updated" date for the policy. Bump when the policy changes.
const UPDATED = "7 June 2026";

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-extrabold leading-tight text-white">Privacy Policy</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: {UPDATED}</p>

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
            We use cookies and similar technologies to keep you signed in, remember preferences
            (such as your selected country), measure traffic, and serve advertising. You can disable
            cookies in your browser settings, though parts of the Site may stop working as expected.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Advertising &amp; third-party vendors</h2>
          <p>
            We display advertising to help fund the Site, including ads served by{" "}
            <strong className="text-white">Google AdSense</strong>.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Third-party vendors, including Google, use cookies to serve ads based on your prior
              visits to this and other websites.
            </li>
            <li>
              Google&rsquo;s use of advertising cookies enables it and its partners to serve ads to
              you based on your visit to this Site and/or other sites on the Internet.
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
              For more on how Google uses data, see{" "}
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
          </ul>
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
            aggregate traffic and performance. These do not identify you personally.
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
