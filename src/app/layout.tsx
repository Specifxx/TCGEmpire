import type { Metadata } from "next";
import Link from "next/link";
import { Sora, Space_Grotesk } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { QuickViewProvider } from "@/components/QuickView";
import { WishlistDrawerProvider } from "@/components/WishlistDrawer";
import { CountryProvider } from "@/components/CountryProvider";
import { getCountry } from "@/lib/get-country";
import { CONTACT_EMAIL, SITE_NAME, SITE_URL } from "@/lib/site";
import { IMPACT_SITE_VERIFICATION } from "@/lib/affiliate";
import { ADSENSE_CLIENT, ADSENSE_ENABLED } from "@/lib/ads";
import { NativeShell } from "@/components/NativeShell";
import { WebAdsLoader } from "@/components/WebAdsLoader";

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
  alternates: { canonical: "/" },
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const country = getCountry();
  return (
    <html lang="en-AU" className={`${sora.variable} ${spaceGrotesk.variable}`}>
      <head>
        {/* Impact / TCGplayer affiliate site-ownership verification. Impact looks for
            the non-standard `value` attribute, so spread it past the meta typing. */}
        <meta {...({ name: "impact-site-verification", value: IMPACT_SITE_VERIFICATION } as any)} />
        {/* Google AdSense site verification. Present as soon as a publisher id is set
            so AdSense can confirm ownership of the site when you add it. */}
        {ADSENSE_ENABLED && <meta name="google-adsense-account" content={ADSENSE_CLIENT} />}
        {/* Warm up the image CDN connection so card thumbnails start loading sooner. */}
        <link rel="preconnect" href="https://cdn.riftscribe.gg" crossOrigin="" />
        <link rel="dns-prefetch" href="https://cdn.riftscribe.gg" />
      </head>
      <body className="min-h-screen bg-ink-950">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
        <CountryProvider initial={country}>
        <WishlistDrawerProvider>
          <QuickViewProvider>
            <Navbar />
            <main className="container-app py-6">{children}</main>
          </QuickViewProvider>
        </WishlistDrawerProvider>
        </CountryProvider>
        <footer className="container-app border-t border-ink-800 py-8 text-center text-xs text-slate-500">
          <div className="mb-2 flex flex-wrap items-center justify-center gap-4 text-sm">
            <Link href="/contact" className="text-slate-300 hover:text-brand-400">Contact &amp; feedback</Link>
            <span className="text-ink-700">·</span>
            <Link href="/privacy" className="text-slate-300 hover:text-brand-400">Privacy policy</Link>
            <span className="text-ink-700">·</span>
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold hover:underline">{CONTACT_EMAIL}</a>
          </div>
          <p>
            RiftCompare · Riftbound card database &amp; price comparison for
            Australia. Prices are sourced from public store listings and may be out
            of date — always confirm on the retailer&apos;s site. Not affiliated with
            or endorsed by Riot Games.
          </p>
        </footer>
        {/* Google AdSense loader — web only. Powers Auto ads + the manual <AdSlot />
            units. Inside the native app this renders nothing (native AdMob is used
            instead, and AdSense isn't allowed in app WebViews). */}
        <WebAdsLoader />
        {/* Detects the Capacitor native runtime and shows native AdMob ads, styles
            the status bar and wires the Android back button. No-op on the web. */}
        <NativeShell />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
