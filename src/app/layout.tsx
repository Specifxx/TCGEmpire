import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "RiftCompareAU — Riftbound Card Database & Price Comparison",
  description:
    "Australia's Riftbound TCG card database. Browse every card and compare live prices across Australian stores to find the cheapest place to buy.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body className="min-h-screen bg-ink-950">
        <Navbar />
        <main className="container-app py-6">{children}</main>
        <footer className="container-app border-t border-ink-800 py-8 text-center text-xs text-slate-500">
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
