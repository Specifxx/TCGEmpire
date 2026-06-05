import type { Metadata } from "next";
import Link from "next/link";
import NextTopLoader from "nextjs-toploader";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "RiftCompareAU — Riftbound Card Database & Price Comparison",
  description:
    "Australia's Riftbound TCG card database. Browse every card and compare live prices across Australian stores to find the cheapest place to buy.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body className="min-h-screen bg-ink-950">
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
