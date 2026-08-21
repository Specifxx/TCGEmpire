import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import { pageAlternates } from "@/lib/seo";
import { FeeCalculator } from "@/components/FeeCalculator";
import { AdSlot } from "@/components/AdSlot";

// /tools/selling-fees — net proceeds after marketplace fees.
//
// Filled a real gap: /blog/tcgplayer-fees explains the fee STRUCTURE (tiered
// commission + payment processing) at length but never lets a seller punch in
// their own numbers and see a total, and no interactive tool existed anywhere
// on the site for a seller-side question. See that article's own header comment
// for why it deliberately never states an exact current commission percentage —
// this tool follows the same rule: the seller types in their own current rate
// from their dashboard, we do the stacked-fee math.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: { absolute: "Riftbound Selling Fee Calculator — Net Proceeds | RiftCompare" },
  description:
    "Calculate your real net payout after TCGplayer or eBay fees on a Riftbound card sale — commission, payment processing and shipping, all stacked correctly.",
  keywords: [
    "TCGplayer fee calculator",
    "Riftbound selling fees",
    "TCGplayer net proceeds",
    "eBay trading card fees",
    "how much does TCGplayer take",
  ],
  alternates: pageAlternates("/tools/selling-fees"),
  openGraph: {
    title: "Riftbound Selling Fee Calculator",
    description: "Real net payout after marketplace fees — commission, processing and shipping, stacked correctly.",
    url: `${SITE_URL}/tools/selling-fees`,
  },
};

const FAQS = [
  {
    q: "How much does TCGplayer take from a sale?",
    a: "Two stacked fees: a marketplace commission (a percentage of the item price, tiered by your seller plan) and payment processing (a percentage plus a small fixed fee, applied to the item price plus shipping). The exact percentages depend on your plan and change over time — check your Seller Portal for your current rate, then use the calculator above with your real numbers.",
  },
  {
    q: "Why isn't there a default commission percentage filled in?",
    a: "TCGplayer's commission is tiered by seller plan and both marketplaces adjust their fee schedules periodically. Printing a specific number here that later goes stale would be worse than asking for your real, current rate — so commission is the one field this tool never pre-fills.",
  },
  {
    q: "Does this work for eBay too?",
    a: "Yes — switch the marketplace tab. eBay's final value fee is commonly cited around 13.25% for trading cards, applied to the total including shipping, plus a small per-order fee — but confirm your current rate, since eBay's schedule also changes.",
  },
  {
    q: "Does the calculator include my own shipping cost?",
    a: "Yes — enter what you actually pay for the mailer and postage separately from what you charge the buyer. Marketplace processing fees apply to what you charge the buyer, not what shipping costs you, so the two numbers affect your net differently.",
  },
];

export default function SellingFeesPage() {
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Selling Fee Calculator", item: `${SITE_URL}/tools/selling-fees` },
    ],
  };
  const appLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Riftbound Selling Fee Calculator",
    url: `${SITE_URL}/tools/selling-fees`,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    description:
      "Free calculator for a seller's real net proceeds after TCGplayer or eBay marketplace commission, payment processing and shipping.",
  };
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: `${SITE_URL}/tools/selling-fees`,
    mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  return (
    <div className="mx-auto max-w-4xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbLd, appLd, faqLd]) }} />

      <div className="mb-5">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <span className="text-slate-300">Selling Fee Calculator</span>
        </nav>
        <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">Riftbound Selling Fee Calculator</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          What do you actually net after selling a Riftbound card on TCGplayer or eBay? Enter the sale, your
          marketplace&apos;s commission and processing rate, and your own shipping cost — the calculator stacks the
          fees correctly and shows the real payout.
        </p>
      </div>

      <FeeCalculator />

      <AdSlot className="mt-6" height={100} />

      <section className="card-surface mt-6 p-5">
        <h2 className="font-bold text-white">How the math works</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Marketplace commission is charged on the item price only. Payment processing is a separate charge — a
          percentage plus a small fixed fee — applied to the item price <strong className="text-slate-200">plus</strong>{" "}
          the shipping you charge the buyer, which is why a cheap card with expensive shipping still loses a real
          share of that shipping revenue to fees. Your own actual shipping cost (the mailer and postage you pay) comes
          out separately at the end. See{" "}
          <Link href="/blog/tcgplayer-fees" className="text-brand-400 hover:underline">how TCGplayer fees stack, in full</Link>{" "}
          for the worked example this tool is based on.
        </p>
      </section>

      <section className="card-surface mt-6 divide-y divide-ink-800 overflow-hidden">
        <h2 className="px-6 py-4 text-lg font-extrabold text-white">Frequently asked questions</h2>
        {FAQS.map((f) => (
          <details key={f.q} className="group px-6 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-slate-200 hover:text-white">
              {f.q}
              <span className="shrink-0 text-slate-500 transition-transform group-open:rotate-180" aria-hidden>▾</span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">{f.a}</p>
          </details>
        ))}
      </section>

      <p className="mt-6 text-center text-sm text-slate-500">
        Buying instead of selling? <Link href="/tools/box-ev" className="text-brand-400 hover:underline">Try the Booster Box EV Calculator</Link>{" "}
        or <Link href="/browse" className="text-brand-400 hover:underline">browse live prices</Link>.
      </p>
    </div>
  );
}
