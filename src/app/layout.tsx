import type { Metadata } from "next";
import Link from "next/link";
import NextTopLoader from "nextjs-toploader";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { CONTACT_EMAIL, SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "RiftCompareAU — Riftbound Card Database & Price Comparison",
    template: "%s — RiftCompareAU",
  },
  description:
    "Australia's Riftbound TCG card database. Browse every card and compare live prices across Australian stores to find the cheapest place to buy.",
  applicationName: SITE_NAME,
  keywords: ["Riftbound", "Riftbound TCG", "Riftbound prices", "Riftbound Australia", "League of Legends TCG", "card prices"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: SITE_URL,
    title: "RiftCompareAU — Riftbound Card Database & Price Comparison",
    description:
      "Compare live Riftbound TCG card prices across Australian stores and find the cheapest place to buy.",
  },
  twitter: { card: "summary_large_image" },
};

const orgJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`,
      description:
        "Australia's Riftbound TCG card database and live price-comparison site.",
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
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
  return (
    <html lang="en-AU">
      <head>
        {/* Warm up the image CDN connection so card thumbnails start loading sooner. */}
        <link rel="preconnect" href="https://cdn.riftscribe.gg" crossOrigin="" />
        <link rel="dns-prefetch" href="https://cdn.riftscribe.gg" />
      </head>
      <body className="min-h-screen bg-ink-950">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
        <NextTopLoader
          color="#34d17e"
          height={3}
          showSpinner
          shadow="0 0 10px #34d17e, 0 0 6px #34d17e"
          easing="ease"
          speed={300}
        />
        <Navbar />
        <main className="container-app py-6">{children}</main>
        <footer className="container-app border-t border-ink-800 py-8 text-center text-xs text-slate-500">
          <div className="mb-2 flex items-center justify-center gap-4 text-sm">
            <Link href="/contact" className="text-slate-300 hover:text-brand-400">Contact &amp; feedback</Link>
            <span className="text-ink-700">·</span>
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold hover:underline">{CONTACT_EMAIL}</a>
          </div>
          <p>
            RiftCompareAU · Riftbound card database &amp; price comparison for
            Australia. Prices are sourced from public store listings and may be out
            of date — always confirm on the retailer&apos;s site. Not affiliated with
            or endorsed by Riot Games.
          </p>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
