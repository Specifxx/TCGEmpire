import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Inter, JetBrains_Mono, Fraunces } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { VendettaRibbon } from "@/components/VendettaRibbon";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { QuickViewProvider } from "@/components/QuickView";
import { SealedQuickViewProvider } from "@/components/SealedQuickView";
import { CommandLauncherProvider } from "@/components/CommandLauncher";
import { MegaMenuProvider } from "@/components/MegaMenuProvider";
import { CountryProvider } from "@/components/CountryProvider";
import { PremiumProvider } from "@/components/PremiumProvider";
import { PremiumDialogProvider } from "@/components/PremiumDialog";
import { DEFAULT_COUNTRY } from "@/lib/country";
import { CONTACT_EMAIL, DISCORD_URL, SITE_NAME, SITE_URL } from "@/lib/site";
import { IMPACT_SITE_VERIFICATION } from "@/lib/affiliate";
import { NAV_GROUPS, MARKETPLACE_NAV_VISIBLE } from "@/components/nav-groups";
import { NativeShell } from "@/components/NativeShell";
import { HilltopAdsLoader } from "@/components/HilltopAdsLoader";
import { ReferralCapture } from "@/components/ReferralCapture";
import { FooterAds } from "@/components/FooterAds";
import { PriceAlertModal } from "@/components/PriceAlertModal";
import { SignupPromoPopup } from "@/components/SignupPromoPopup";
import { enabledProviders } from "@/lib/oauth";
import { MetaPixel } from "@/components/MetaPixel";

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
    "The Riftbound TCG card database and price comparison. Browse every card and compare live prices across stores in Australia, New Zealand, the US, the UK and Singapore to find the cheapest place to buy.",
  applicationName: SITE_NAME,
  keywords: ["Riftbound", "Riftbound TCG", "Riftbound prices", "Riftbound singles", "League of Legends TCG", "card prices"],
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
      "Compare live Riftbound TCG card prices across stores in Australia, New Zealand, the US, the UK and Singapore to find the cheapest place to buy.",
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
  verification: {
    google:
      process.env.GOOGLE_SITE_VERIFICATION ??
      "fPFxAkXOBeYdNPNbNGo-ZItApU0457uWVkbPkfzzzXs",
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
        { "@type": "Country", name: "New Zealand" },
        { "@type": "Country", name: "United States" },
        { "@type": "Country", name: "United Kingdom" },
        { "@type": "Country", name: "Singapore" },
      ],
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: CONTACT_EMAIL,
        availableLanguage: "English",
      },
      description:
        "Riftbound: League of Legends TCG card database and live price-comparison across Australia, New Zealand, the United States, the United Kingdom and Singapore, home of the RiftCompare Index.",
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
  // Neutral lang="en": one cookie-switched URL serves all four English markets
  // (AU/NZ/US/UK), so a single market tag like en-AU would mislabel the others.
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} ${fraunces.variable}`}>
      <head>
        {/* Impact / TCGplayer affiliate site-ownership verification. Impact looks for
            the non-standard `value` attribute, so spread it past the meta typing. */}
        <meta {...({ name: "impact-site-verification", value: IMPACT_SITE_VERIFICATION } as any)} />
        {/* HilltopAds site-ownership verification (homepage). */}
        <meta name="f56d4c757e10b95b149b998706568143dfa0d0e9" content="f56d4c757e10b95b149b998706568143dfa0d0e9" />
        {/* Google AdSense site-ownership verification. */}
        <meta name="google-adsense-account" content="ca-pub-6262011577596407" />
        {/* Warm up the image CDN connection so card thumbnails start loading sooner. */}
        <link rel="preconnect" href="https://cdn.riftscribe.gg" crossOrigin="" />
        <link rel="dns-prefetch" href="https://cdn.riftscribe.gg" />
      </head>
      <body className="min-h-screen bg-ink-950">
        {/* Skip link: lets keyboard/AT users bypass the navbar and jump straight
            to content. Visually hidden until focused (WCAG 2.4.1 Level A). */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-ink-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-400 focus:ring-2 focus:ring-brand-400"
        >
          Skip to main content
        </a>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
        <PremiumProvider>
        <PremiumDialogProvider>
        <CountryProvider initial={DEFAULT_COUNTRY}>
          <QuickViewProvider>
          <SealedQuickViewProvider>
            <CommandLauncherProvider>
              <MegaMenuProvider>
                <Navbar />
                <VendettaRibbon />
                <main id="main-content" className="container-app min-w-0 py-6">{children}</main>
                <PriceAlertModal />
                <SignupPromoPopup providers={enabledProviders()} />
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
        </CountryProvider>
        <footer className="container-app border-t border-ink-800 py-8 text-center text-xs text-slate-500">
          <NewsletterSignup siteName="RiftCompare" />
          {/* Site-map — surfaced here so every page links to every feature even
              when the xl SideNav is absent (mobile, homepage, smaller desktops). */}
          <nav aria-label="Site map" className="mb-6 border-b border-ink-800 pb-6">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-left sm:grid-cols-3 lg:grid-cols-6">
              {NAV_GROUPS.map((group) => (
                <div key={group.title}>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{group.title}</div>
                  <ul className="space-y-1">
                    {group.links.map((l) => (
                      <li key={l.href}>
                        <Link href={l.href} className="text-xs text-slate-400 hover:text-brand-400">
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </nav>
          <div className="mb-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
            <Link href="/about" className="text-slate-300 hover:text-brand-400">About</Link>
            <span className="text-ink-700">·</span>
            <Link href="/contact" className="text-slate-300 hover:text-brand-400">Contact &amp; feedback</Link>
            <span className="text-ink-700">·</span>
            <Link href="/privacy" className="text-slate-300 hover:text-brand-400">Privacy policy</Link>
            <span className="text-ink-700">·</span>
            <Link href="/terms" className="text-slate-300 hover:text-brand-400">Terms</Link>
            <span className="text-ink-700">·</span>
            {/* Returns sits OUTSIDE the MARKETPLACE_NAV_VISIBLE gate on purpose:
                Google Merchant Center and Shopping ads need a conventional return
                policy reachable from every page regardless of whether marketplace
                navigation is currently surfaced. */}
            <Link href="/returns" className="text-slate-300 hover:text-brand-400">Returns &amp; shipping</Link>
            <span className="text-ink-700">·</span>
            {MARKETPLACE_NAV_VISIBLE && (
              <>
                <Link href="/marketplace/terms" className="text-slate-300 hover:text-brand-400">Marketplace terms</Link>
                <span className="text-ink-700">·</span>
                <Link href="/marketplace/buyer-protection" className="text-slate-300 hover:text-brand-400">Buyer protection</Link>
                <span className="text-ink-700">·</span>
                <Link href="/marketplace/shipping" className="text-slate-300 hover:text-brand-400">Shipping &amp; tracking</Link>
                <span className="text-ink-700">·</span>
                <Link href="/marketplace/faq" className="text-slate-300 hover:text-brand-400">Marketplace FAQ</Link>
                <span className="text-ink-700">·</span>
              </>
            )}
            <Link href="/widgets" className="text-slate-300 hover:text-brand-400">Price widget</Link>
            <span className="text-ink-700">·</span>
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold hover:underline">{CONTACT_EMAIL}</a>
          </div>
          {/* Cross-promotion: our sister site for the Pokémon TCG. */}
          <p className="mb-2">
            Collect <strong className="font-semibold text-slate-400">Pokémon</strong> cards too? Compare
            prices across every English card on our sister site{" "}
            <a
              href="https://dexcompare.app"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-brand-400 hover:underline"
            >
              DexCompare.app
            </a>
            .
          </p>
          <p>
            RiftCompare · Riftbound card database &amp; price comparison for
            Australia, New Zealand, the US, the UK and Singapore. Prices are sourced from public store listings and may be out
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
        </footer>
        {/* HilltopAds zone loader — the primary ad network (web only, non-premium).
            Skipped inside the native app, which shows AdMob banners via NativeShell. */}
        <HilltopAdsLoader />
        {/* Detects the Capacitor native runtime and shows native AdMob ads, styles
            the status bar and wires the Android back button. No-op on the web. */}
        <NativeShell />
        {/* Stashes an inbound ?ref=<userId> into a cookie for referral credit. */}
        <ReferralCapture />
        <Analytics />
        <SpeedInsights />
        {/* Meta Pixel — ad measurement + retargeting for Meta (Facebook/Instagram)
            ads. Production + web only; see the component for the guards. */}
        <MetaPixel />
        </PremiumDialogProvider>
        </PremiumProvider>
      </body>
    </html>
  );
}
