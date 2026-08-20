import type { Metadata, Viewport } from "next";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Inter, JetBrains_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { QuickViewProvider } from "@/components/QuickView";
import { SealedQuickViewProvider } from "@/components/SealedQuickView";
import { CommandLauncherProvider } from "@/components/CommandLauncher";
import { MegaMenuProvider } from "@/components/MegaMenuProvider";
import { CountryProvider } from "@/components/CountryProvider";
import { LocaleProvider } from "@/components/LocaleProvider";
import { PremiumProvider } from "@/components/PremiumProvider";
import { PremiumDialogProvider } from "@/components/PremiumDialog";
import { DEFAULT_COUNTRY } from "@/lib/country";
import { CONTACT_EMAIL, DISCORD_URL, SITE_NAME, SITE_URL } from "@/lib/site";
import { IMPACT_SITE_VERIFICATION } from "@/lib/affiliate";
import { MARKETPLACE_NAV_VISIBLE } from "@/components/nav-groups";
import { FooterNav } from "@/components/FooterNav";
import { ShareRow } from "@/components/ShareRow";
import { enabledProviders } from "@/lib/oauth";
import { SIGNUP_PREMIUM_DAYS } from "@/lib/premium";
import { AdSenseLoader } from "@/components/AdSenseLoader";
import { ConsentDefaults } from "@/components/ConsentDefaults";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { GAPageViewTracker } from "@/components/GAPageViewTracker";
import { GoogleAnalyticsUser } from "@/components/GoogleAnalyticsUser";
import { ConsentGatedAnalytics } from "@/components/ConsentGatedAnalytics";
import { PrivacySettingsLink } from "@/components/PrivacySettingsLink";
import { ADSENSE_CLIENT_ID, ADSENSE_CONFIGURED } from "@/lib/adsense";

// Neither is needed for the initial paint or SEO: the alert modal only opens in
// response to a PriceWatchButton click, and the signup popup waits 25s before
// showing itself. ssr:false + dynamic import keeps both out of the JS the
// browser has to parse/execute before first paint.
const PriceAlertModal = dynamic(() => import("@/components/PriceAlertModal").then((m) => m.PriceAlertModal), {
  ssr: false,
});
const SignupPromoPopup = dynamic(() => import("@/components/SignupPromoPopup").then((m) => m.SignupPromoPopup), {
  ssr: false,
});
// The always-available feedback launcher. ssr:false because it renders nothing
// until a visitor clicks it, so there is no content for a crawler to miss and no
// reason to pay for it in the server HTML.
const FeedbackWidget = dynamic(() => import("@/components/FeedbackWidget").then((m) => m.FeedbackWidget), {
  ssr: false,
});
// Real footer ad content — kept SSR'd (ssr: true, the default) for the same
// reason the rest of the site's ad units are: an AdSense reviewer or crawler
// fetching raw HTML must still see it. Only the JS is split out of the
// initial hydration bundle.
const FooterAds = dynamic(() => import("@/components/FooterAds").then((m) => m.FooterAds));
// Both render nothing on the web (NativeShell no-ops outside the Capacitor
// native app; ReferralCapture is a pure side-effect that writes a cookie) —
// ssr:false costs nothing content-wise and keeps their JS out of the bundle
// every browser visitor has to parse before hydration.
const NativeShell = dynamic(() => import("@/components/NativeShell").then((m) => m.NativeShell), { ssr: false });
const ReferralCapture = dynamic(() => import("@/components/ReferralCapture").then((m) => m.ReferralCapture), {
  ssr: false,
});

// PREVIEW BRANCH — emulates the official Riftbound/League of Legends site's
// typographic DNA (a sharp, flared serif for titling over a clean humanist sans
// for body/UI) using free, properly-licensed fonts. Riot's actual "Beaufort for
// LoL" and "Spiegel" are proprietary, custom-commissioned typefaces — there is no
// legitimate self-hosted or hotlinked @font-face source for them on a third-party
// site, so this uses look-alikes instead:
//   Headings — Fraunces: a sharp, high-contrast, slightly flared serif at a heavy
//     weight. Closest free analog to Beaufort's bold titling character.
//   Body/UI  — Inter: a clean, highly legible humanist grotesque — the same
//     family Spiegel itself is often compared to.
// Exposed as CSS vars wired into Tailwind. display: "swap" — the brand fonts
// ALWAYS render (consistent on every load) rather than "optional" which silently
// keeps the system fallback whenever the font misses the ~100ms first-paint
// window. adjustFontFallback (next/font default) size-matches the fallback so the
// swap-in causes negligible layout shift.
const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
// Monospace for prices / tabular figures / tickers — the "market terminal" voice.
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
// Sharp flared serif for headings only — the Beaufort-style look-alike (see note above).
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["600", "700", "900"],
  style: ["normal"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "RiftCompare — Riftbound Card Database & Price Comparison",
    template: "%s — RiftCompare",
  },
  description:
    "The Riftbound TCG card database and price comparison. Browse every card and compare live prices across stores in Australia, the US, the UK, Singapore, Canada and Germany to find the cheapest place to buy.",
  applicationName: SITE_NAME,
  // NO `keywords` meta. Google has ignored it since 2009 and Bing treats stuffing
  // it as a negative signal; it only ever advertised our target terms to
  // competitors. Removed site-wide rather than per-page because it was declared
  // here and inherited everywhere.
  alternates: {
    // NO site-wide canonical here: it propagates to every page that doesn't set
    // its own, telling Google those pages are duplicates of the homepage (GSC:
    // "Alternate page with proper canonical tag"). Each indexable page declares
    // its own canonical; the home page sets "/" in app/page.tsx.
    // RSS + JSON Feed auto-discovery for feed readers, agents and auto-posting services.
    types: { "application/rss+xml": "/feed.xml", "application/feed+json": "/feed.json" },
    // x-default baseline: markets are cookie-driven on ONE URL set (not URL-
    // segmented), so we declare the canonical home as the global default rather
    // than fabricating per-locale hreflang variants.
    languages: { "x-default": SITE_URL },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: SITE_URL,
    title: "RiftCompare — Riftbound Card Database & Price Comparison",
    description:
      "Compare live Riftbound TCG card prices across stores in Australia, the US, the UK, Singapore, Canada and Germany to find the cheapest place to buy.",
  },
  twitter: { card: "summary_large_image" },
  // Opt into large image thumbnails + full text snippets in Google/Bing results
  // (Search-Essentials best practice). Per-page noindex still overrides this.
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  // Search engine site verification. Google's "HTML tag" method verifies a
  // URL-prefix property INSTANTLY (no DNS propagation wait) — the token below is
  // served in <head> on every page. Override per-deploy via env if needed.
  //
  // Bing Webmaster Tools uses the same "meta tag" method, keyed `msvalidate.01`
  // — Next's `verification.other` emits it as a second <meta name="..."> next to
  // Google's. UNLIKE Google's, there is no real token to fall back to here: this
  // repo has never had one, so — deliberately, unlike GOOGLE_SITE_VERIFICATION
  // above — nothing renders until BING_SITE_VERIFICATION is set in the deploy
  // env. A fabricated placeholder would just fail Bing's verification check
  // silently; omitting the tag entirely until a real token exists is the
  // correct failure mode. Bing + DuckDuckGo + Brave (Bing-indexed) are ~45% of
  // this site's search referrals and were unmonitored before this.
  verification: {
    google:
      process.env.GOOGLE_SITE_VERIFICATION ??
      "fPFxAkXOBeYdNPNbNGo-ZItApU0457uWVkbPkfzzzXs",
    ...(process.env.BING_SITE_VERIFICATION ? { other: { "msvalidate.01": process.env.BING_SITE_VERIFICATION } } : {}),
  },
};

// Brand chrome colour for the browser UI / installed-PWA theme (matches the
// site's ink-950 background). Paired with the web manifest (app/manifest.ts).
export const viewport: Viewport = { themeColor: "#0b0e14" };

const orgJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: SITE_NAME,
      alternateName: ["Rift Compare", "RiftCompare.com"],
      url: SITE_URL,
      logo: `${SITE_URL}/icon-512.png`,
      // Linked profiles — entity signals tying the org to its community presence.
      // ADD real profile URLs here as they exist (X/Twitter, YouTube, Reddit) and a
      // Wikidata item once created; each `sameAs` strengthens entity disambiguation
      // for AI answer engines (Gemini/Perplexity) where brand signals outweigh links.
      sameAs: [DISCORD_URL],
      // What this entity is authoritative about — helps NER map "RiftCompare" to the
      // specific TCG-pricing entity rather than a generic term.
      knowsAbout: [
        "Riftbound",
        "Riftbound: League of Legends TCG",
        "Trading card game prices",
        "Trading card price comparison",
        "The RiftCompare Index",
        "Sealed trading card products",
      ],
      // Markets served (drives regional entity understanding without per-locale URLs).
      areaServed: [
        { "@type": "Country", name: "Australia" },
        { "@type": "Country", name: "United States" },
        { "@type": "Country", name: "United Kingdom" },
        { "@type": "Country", name: "Singapore" },
        { "@type": "Country", name: "Canada" },
        { "@type": "Country", name: "Germany" },
      ],
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: CONTACT_EMAIL,
        availableLanguage: "English",
      },
      description:
        "Riftbound: League of Legends TCG card database and live price-comparison across Australia, the United States, the United Kingdom, Singapore, Canada and Germany, home of the RiftCompare Index.",
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      alternateName: ["Rift Compare", "RiftCompare.com"],
      publisher: { "@id": `${SITE_URL}/#org` },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/browse?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

// CRITICAL FOR CACHING: this layout must never read cookies()/headers()
// (directly or via getCountry()/getCurrentUser()). A dynamic-API read in the
// root layout opts EVERY route into per-request rendering, silently disabling
// all page-level `revalidate` exports. Market, session and Premium status are
// resolved client-side instead (CountryProvider reconciles from
// document.cookie + /api/geo; NavUser/PremiumProvider fetch /api/me).
export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Neutral lang="en": one cookie-switched URL serves all three English markets
  // (AU/US/UK), so a single market tag like en-AU would mislabel the others.
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} ${fraunces.variable}`}>
      <head>
        {/* Google Consent Mode v2 defaults — MUST be the first thing that runs, so
            the ad/measurement tags below never fire against an unset state. */}
        <ConsentDefaults />
        {/* Google Analytics 4. Mounted AFTER ConsentDefaults on purpose — Consent
            Mode only applies to hits queued behind its defaults, so the order of
            these two lines is load-bearing, not cosmetic. See the component
            header for why this is not Google's verbatim snippet. */}
        <GoogleAnalytics />
        {/* Fires GA4's page_view explicitly on every client-side route change —
            see the component header for why this replaced relying on GA4's
            Enhanced Measurement History-API auto-detection. */}
        <GAPageViewTracker />
        {/* GA4 User-ID. Renders nothing; sets an opaque per-account identifier once
            /api/me resolves and consent allows, and clears it on sign-out. Safe to
            mount in <head> — it is a client component with no markup, so it does
            not depend on being anywhere in particular. */}
        <GoogleAnalyticsUser />
        {/* Impact / TCGplayer affiliate site-ownership verification. Impact looks for
            the non-standard `value` attribute, so spread it past the meta typing. */}
        <meta {...({ name: "impact-site-verification", value: IMPACT_SITE_VERIFICATION } as any)} />
        {/* Google AdSense site-ownership verification. The id comes from
            NEXT_PUBLIC_ADSENSE_CLIENT_ID (see lib/adsense.ts) — it is NEVER a
            literal here again. A hardcoded, out-of-date id on this exact line,
            belonging to no account under review, is the fault that most likely
            voided the last two applications. See docs/adsense-remediation.md. */}
        {ADSENSE_CONFIGURED && <meta name="google-adsense-account" content={ADSENSE_CLIENT_ID} />}
        {/* The AdSense loader: ownership verification + Auto ads + the EEA/UK/CH
            consent message, on every page, ungated. See the component header. */}
        <AdSenseLoader />
        {/* Ad/consent origins — shaving a round-trip off the loader and the
            consent message, which is what the 0-impression message needed. */}
        <link rel="preconnect" href="https://pagead2.googlesyndication.com" crossOrigin="" />
        <link rel="preconnect" href="https://fundingchoicesmessages.google.com" crossOrigin="" />
        {/* Warm up the image CDN connection so card thumbnails start loading sooner. */}
        <link rel="preconnect" href="https://cdn.riftscribe.gg" crossOrigin="" />
        <link rel="dns-prefetch" href="https://cdn.riftscribe.gg" />
      </head>
      <body className="min-h-screen bg-ink-950">
        {/* Skip link: lets keyboard/AT users bypass the navbar and jump straight
            to content. Visually hidden until focused (WCAG 2.4.1 Level A).
            focus:min-h-11 + flex/items-center: measured ~36px tall once
            focused (py-2 + text-sm alone) — short of this site's 44px mobile
            tap-target floor. Still keyboard-first in practice (Tab then
            Enter, not a touch tap), but there's no reason to leave a known,
            cheap-to-fix gap against the same floor everything else on the
            page now meets. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:flex focus:min-h-11 focus:items-center focus:rounded-lg focus:bg-ink-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-400 focus:ring-2 focus:ring-brand-400"
        >
          Skip to main content
        </a>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
        <PremiumProvider>
        <PremiumDialogProvider>
        <CountryProvider initial={DEFAULT_COUNTRY}>
        {/* Nested inside CountryProvider (not a sibling) because its DE-default
            logic reads useCountry() — and extended to wrap the footer below
            (not just the boundary CountryProvider used to close at) so
            FooterNav's <Localized> leaves can reach it too. See LocaleProvider's
            own header comment for why the language toggle is scoped to "a facet
            of Germany mode" rather than an independent global preference. */}
        <LocaleProvider>
          <QuickViewProvider>
          <SealedQuickViewProvider>
            <CommandLauncherProvider>
              <MegaMenuProvider>
                <Navbar />
                {/* No announcement ribbon here any more — the homepage's Vendetta
                    block (right under the hero) carries the "it's here" message
                    with real prices instead of a repeating marquee claim. */}
                <main id="main-content" className="container-app min-w-0 py-6">{children}</main>
                <PriceAlertModal />
                <SignupPromoPopup providers={enabledProviders()} signupPremiumDays={SIGNUP_PREMIUM_DAYS} />
                {/* Feedback launcher. Deliberately never auto-opens — see the
                    component header for why a second uninvited dialog would be
                    self-defeating here. It hides itself over the ad zone below. */}
                <FeedbackWidget />
              </MegaMenuProvider>
            </CommandLauncherProvider>
          </SealedQuickViewProvider>
          </QuickViewProvider>
        {/* Site-wide affiliate banners above the footer — BOTH live partners
            (TCGplayer Impact + eBay Partner Network) on every page, so no page
            is left unmonetised. Both are CPC/affiliate: they pay on click-through
            purchases, so placement-where-relevant beats raw banner count.
            FooterAds reads the market from the client country context (inside
            CountryProvider) so the layout stays cookie-free and cacheable. */}
        <FooterAds />
        <footer className="container-app border-t border-ink-800 py-8 text-center text-xs text-slate-500">
          <NewsletterSignup siteName="RiftCompare" />
          {/* Site-map — surfaced here so every page links to every feature even
              when the xl SideNav is absent (mobile, homepage, smaller desktops).
              4 columns on desktop, collapsible accordions on mobile — see
              FooterNav / nav-groups.ts's FOOTER_GROUPS for the re-bucketing. */}
          <FooterNav />
          {/* Share band. The site's only other share controls are per-article
              (ArticleShare) and per-card (ShareButton), so there was nowhere to
              share RiftCompare ITSELF from — the thing a happy visitor is most
              likely to want to pass on. Sits in the footer on every page:
              always reachable, never an interruption. */}
          <div className="mb-5 flex flex-col items-center gap-2 border-y border-ink-800/70 py-4">
            <span className="text-xs text-slate-400">Find RiftCompare useful? Send it to someone who buys Riftbound.</span>
            <ShareRow source="footer" size="sm" />
          </div>
          <div className="mb-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
            <Link href="/about" className="tap-link text-slate-300 hover:text-brand-400">About</Link>
            <span className="text-ink-700">·</span>
            <Link href="/contact" className="tap-link text-slate-300 hover:text-brand-400">Contact &amp; feedback</Link>
            <span className="text-ink-700">·</span>
            <Link href="/privacy" className="tap-link text-slate-300 hover:text-brand-400">Privacy policy</Link>
            <span className="text-ink-700">·</span>
            <Link href="/terms" className="tap-link text-slate-300 hover:text-brand-400">Terms</Link>
            <span className="text-ink-700">·</span>
            {/* Returns sits OUTSIDE the MARKETPLACE_NAV_VISIBLE gate on purpose:
                Google Merchant Center and Shopping ads need a conventional return
                policy reachable from every page regardless of whether marketplace
                navigation is currently surfaced. */}
            <Link href="/returns" className="tap-link text-slate-300 hover:text-brand-400">Returns &amp; shipping</Link>
            <span className="text-ink-700">·</span>
            {MARKETPLACE_NAV_VISIBLE && (
              <>
                <Link href="/marketplace/terms" className="tap-link text-slate-300 hover:text-brand-400">Marketplace terms</Link>
                <span className="text-ink-700">·</span>
                <Link href="/marketplace/buyer-protection" className="tap-link text-slate-300 hover:text-brand-400">Buyer protection</Link>
                <span className="text-ink-700">·</span>
                <Link href="/marketplace/shipping" className="tap-link text-slate-300 hover:text-brand-400">Shipping &amp; tracking</Link>
                <span className="text-ink-700">·</span>
                <Link href="/marketplace/faq" className="tap-link text-slate-300 hover:text-brand-400">Marketplace FAQ</Link>
                <span className="text-ink-700">·</span>
              </>
            )}
            <Link href="/editorial-policy" className="tap-link text-slate-300 hover:text-brand-400">Editorial policy</Link>
            <span className="text-ink-700">·</span>
            <Link href="/methodology" className="tap-link text-slate-300 hover:text-brand-400">Methodology</Link>
            <span className="text-ink-700">·</span>
            <Link href="/authors" className="tap-link text-slate-300 hover:text-brand-400">Who writes this</Link>
            <span className="text-ink-700">·</span>
            {/* Discord was header-only (see Navbar.tsx) plus the Organization
                JSON-LD's sameAs below — the homepage-redesign brief's footer
                table explicitly lists it as something the footer itself must
                show, so it gets a real row here too. A plain external <a>
                (not FooterNav/NAV_GROUPS): NAV_GROUPS also feeds the ⌘K
                command launcher, whose keyboard-select path calls Next's
                router.push(href) — built for internal routes, not an
                external https:// URL — so adding it there risked a broken
                launcher entry for the sake of one footer link. This row
                already carries other plain external links (RiftboundStocks.com
                below, the mailto: link) with the same pattern. */}
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="tap-link text-slate-300 hover:text-[#5865F2]"
            >
              Discord
            </a>
            <span className="text-ink-700">·</span>
            {/* Re-opens Google's consent message (EEA/UK/CH only — renders
                nothing where no message applies). Required for a published
                GDPR message: consent has to be revocable. */}
            <PrivacySettingsLink />
            <a href={`mailto:${CONTACT_EMAIL}`} className="tap-link text-gold hover:underline">{CONTACT_EMAIL}</a>
          </div>
          {/* Cross-promotion: our other Riftbound side project. Cheeky on purpose —
              per owner request 2026-08-13. */}
          <p className="mb-2">
            Yes, we know Riftbound cards aren&apos;t literally stocks. Try telling
            that to{" "}
            {/* tap-link: measured ~15px tall on mobile (a plain inline <a>,
                min-height doesn't apply without a flex/inline-flex display) —
                same fix as this row's other plain external links above. */}
            <a
              href="https://riftboundstocks.com"
              target="_blank"
              rel="noopener noreferrer"
              className="tap-link font-semibold text-brand-400 hover:underline"
            >
              RiftboundStocks.com
            </a>
            , our other site, where we track them like the market&apos;s open anyway.
          </p>
          <p>
            RiftCompare · Riftbound card database &amp; price comparison for
            Australia, the US, the UK, Singapore, Canada and Germany. Prices are sourced from public store listings and may be out
            of date — always confirm on the retailer&apos;s site.
          </p>
          {/* Riot's Legal Jibber Jabber policy requires this EXACT notice, displayed
              conspicuously, for any fan project using Riot-owned assets (card art,
              names, the Riftbound marks). Keep the wording verbatim — it's what
              licenses our use of the art, and it's the attribution an ad-network or
              IP reviewer looks for. https://www.riotgames.com/en/legal */}
          <p>
            RiftCompare was created under Riot Games&apos; &ldquo;Legal Jibber Jabber&rdquo;
            policy using assets owned by Riot Games. Riot Games does not endorse or
            sponsor this project.
          </p>
          <p className="mt-2">&copy; {new Date().getFullYear()} {SITE_NAME}. All rights reserved.</p>
        </footer>
        </LocaleProvider>
        </CountryProvider>
        {/* Detects the Capacitor native runtime and shows native AdMob ads, styles
            the status bar and wires the Android back button. No-op on the web. */}
        <NativeShell />
        {/* Stashes an inbound ?ref=<userId> into a cookie for referral credit. */}
        <ReferralCapture />
        {/* Vercel Analytics + Speed Insights, held until the same consent signal
            the ad tags use resolves (Consent Mode v2 defaults everything denied).
            Outside the consent message's scope this mounts after a short grace
            period, so non-EEA measurement is unaffected. */}
        <ConsentGatedAnalytics />
        </PremiumDialogProvider>
        </PremiumProvider>
      </body>
    </html>
  );
}
