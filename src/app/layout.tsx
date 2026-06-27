import type { Metadata } from "next";
import Link from "next/link";
import { Sora, Space_Grotesk } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { SideNav } from "@/components/SideNav";
import { SideNavGate } from "@/components/SideNavGate";
import { QuickViewProvider } from "@/components/QuickView";
import { CommandLauncherProvider } from "@/components/CommandLauncher";
import { WishlistDrawerProvider } from "@/components/WishlistDrawer";
import { CountryProvider } from "@/components/CountryProvider";
import { PremiumProvider } from "@/components/PremiumProvider";
import { getCountry } from "@/lib/get-country";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { BUYMEACOFFEE_URL, CONTACT_EMAIL, DISCORD_URL, SITE_NAME, SITE_URL } from "@/lib/site";
import { IMPACT_SITE_VERIFICATION } from "@/lib/affiliate";
import { NAV_GROUPS } from "@/components/nav-groups";
import { NativeShell } from "@/components/NativeShell";
import { HilltopAdsLoader } from "@/components/HilltopAdsLoader";
import { ReferralCapture } from "@/components/ReferralCapture";
import { TcgplayerAd } from "@/components/TcgplayerAd";
import { EbayAd } from "@/components/EbayAd";
import { SovrnSnippet } from "@/components/SovrnSnippet";
import { PriceAlertModal } from "@/components/PriceAlertModal";

// Body: Sora (modern, energetic, readable). Headings: Space Grotesk (distinctive,
// gives the brand more life). Exposed as CSS vars wired into Tailwind.
const sora = Sora({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "RiftCompare — Riftbound Card Database & Price Comparison",
    template: "%s — RiftCompare",
  },
  description:
    "The Riftbound TCG card database and price comparison. Browse every card and compare live prices across stores in Australia, New Zealand and the United States to find the cheapest place to buy.",
  applicationName: SITE_NAME,
  keywords: ["Riftbound", "Riftbound TCG", "Riftbound prices", "Riftbound singles", "League of Legends TCG", "card prices"],
  alternates: {
    // NO site-wide canonical here: it propagates to every page that doesn't set
    // its own, telling Google those pages are duplicates of the homepage (GSC:
    // "Alternate page with proper canonical tag"). Each indexable page declares
    // its own canonical; the home page sets "/" in app/page.tsx.
    // RSS auto-discovery for feed readers and auto-posting/aggregator services.
    types: { "application/rss+xml": "/feed.xml" },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: SITE_URL,
    title: "RiftCompare — Riftbound Card Database & Price Comparison",
    description:
      "Compare live Riftbound TCG card prices across stores in Australia, New Zealand and the US to find the cheapest place to buy.",
  },
  twitter: { card: "summary_large_image" },
  // Search engine site verification. Google's "HTML tag" method verifies a
  // URL-prefix property INSTANTLY (no DNS propagation wait) — the token below is
  // served in <head> on every page. Override per-deploy via env if needed.
  verification: {
    google:
      process.env.GOOGLE_SITE_VERIFICATION ??
      "fPFxAkXOBeYdNPNbNGo-ZItApU0457uWVkbPkfzzzXs",
  },
};

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
      sameAs: [DISCORD_URL],
      description:
        "Riftbound TCG card database and live price-comparison across Australia, New Zealand and the US.",
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const country = getCountry();
  // Premium members get an ad-free site: no ad loader and the ad components
  // self-hide via PremiumProvider. getCurrentUser is request-cached.
  const user = await getCurrentUser();
  const adFree = isPremium(user);
  return (
    <html lang="en-AU" className={`${sora.variable} ${spaceGrotesk.variable}`}>
      <head>
        {/* Impact / TCGplayer affiliate site-ownership verification. Impact looks for
            the non-standard `value` attribute, so spread it past the meta typing. */}
        <meta {...({ name: "impact-site-verification", value: IMPACT_SITE_VERIFICATION } as any)} />
        {/* HilltopAds site-ownership verification (homepage). */}
        <meta name="f56d4c757e10b95b149b998706568143dfa0d0e9" content="f56d4c757e10b95b149b998706568143dfa0d0e9" />
        {/* Warm up the image CDN connection so card thumbnails start loading sooner. */}
        <link rel="preconnect" href="https://cdn.riftscribe.gg" crossOrigin="" />
        <link rel="dns-prefetch" href="https://cdn.riftscribe.gg" />
      </head>
      <body className="min-h-screen bg-ink-950">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
        <PremiumProvider value={adFree}>
        <CountryProvider initial={country}>
        <WishlistDrawerProvider>
          <QuickViewProvider>
            <CommandLauncherProvider>
              <Navbar />
              <div className="container-app flex gap-6 py-6">
                <SideNavGate>
                  <SideNav />
                </SideNavGate>
                <main className="min-w-0 flex-1">{children}</main>
              </div>
              <PriceAlertModal />
            </CommandLauncherProvider>
          </QuickViewProvider>
        </WishlistDrawerProvider>
        </CountryProvider>
        {/* Site-wide affiliate banners above the footer — BOTH live partners
            (TCGplayer Impact + eBay Partner Network) on every page, so no page
            is left unmonetised. Both are CPC/affiliate: they pay on click-through
            purchases, so placement-where-relevant beats raw banner count. */}
        <div className="container-app flex flex-col items-center gap-3 pb-8">
          <TcgplayerAd size="leaderboard" country={country} />
          <EbayAd size="leaderboard" country={country} />
        </div>
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
            Australia, New Zealand, the US and the UK. Prices are sourced from public store listings and may be out
            of date — always confirm on the retailer&apos;s site. Not affiliated with
            or endorsed by Riot Games.
          </p>
          {/* Buy me a coffee — a low-friction tip option at the very bottom. */}
          <a
            href={BUYMEACOFFEE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#FFDD00] px-4 py-2 text-sm font-bold text-[#0d0c0c] transition-transform hover:-translate-y-0.5"
          >
            <span aria-hidden>☕</span> Buy me a coffee
          </a>
        </footer>
        {/* Sovrn auto-affiliate (deferred to idle) — monetises the long-tail
            store links; skips anything already affiliate-tagged. */}
        <SovrnSnippet />
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
        </PremiumProvider>
      </body>
    </html>
  );
}
