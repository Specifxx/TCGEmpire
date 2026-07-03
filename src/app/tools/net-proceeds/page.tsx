import type { Metadata } from "next";
import Link from "next/link";
import { NetProceeds } from "@/components/NetProceeds";
import { SITE_URL } from "@/lib/site";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: { absolute: "Riftbound Card Selling Fee Calculator — What You'll Actually Net | RiftCompare" },
  description:
    "Free calculator: enter what your Riftbound card sells for and see what you actually pocket after eBay / TCGplayer fees, postage and optional grading. Works in AUD, NZD, USD and GBP.",
  alternates: { canonical: "/tools/net-proceeds" },
  keywords: [
    "riftbound card selling fees",
    "ebay fee calculator trading cards",
    "how much do i make selling riftbound cards",
    "riftbound card net proceeds",
  ],
  openGraph: {
    title: "Riftbound Card Selling Fee Calculator",
    description: "See what you actually pocket after fees, postage and grading — AUD/NZD/USD/GBP.",
    url: `${SITE_URL}/tools/net-proceeds`,
  },
};

export default function NetProceedsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-slate-300">Home</Link>
        <span>/</span>
        <span className="text-slate-300">Selling fee calculator</span>
      </nav>

      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">What you&apos;ll actually pocket</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
        Every price site tells you what a card is <em>worth</em>. This tells you what you keep after
        the marketplace takes its cut. Enter a sale price and see your real net — after eBay or
        TCGplayer fees, postage, and the cost of grading it first if you go that route.
      </p>

      <div className="mt-6"><NetProceeds /></div>

      <section className="mt-8 card-surface p-6">
        <h2 className="text-lg font-bold text-white">How selling fees work</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-400">
          <li><strong className="text-slate-200">eBay</strong> takes a final-value fee (~13% for trading cards) plus a small fixed fee, charged on the item <em>and</em> the postage the buyer pays.</li>
          <li><strong className="text-slate-200">TCGplayer</strong> (US) takes commission plus payment processing — roughly 12–13% all-in.</li>
          <li><strong className="text-slate-200">Private / local sale</strong> has no marketplace fee, but you&apos;ll usually accept a lower price for the convenience.</li>
          <li><strong className="text-slate-200">Grading</strong> only makes sense when the graded price beats the raw price by more than the grading cost — see the{" "}
            <Link href="/tools/grade-ev" className="text-brand-400 hover:underline">grade-or-not calculator</Link>.</li>
        </ul>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [
          { "@type": "Question", name: "How much does eBay take when I sell a Riftbound card?", acceptedAnswer: { "@type": "Answer", text: "eBay charges a final-value fee of roughly 13% for trading cards plus a small fixed per-order fee, applied to the item price and the postage the buyer pays. On a $100 sale you'd typically net around $86 before your own postage cost." } },
          { "@type": "Question", name: "Should I grade a Riftbound card before selling it?", acceptedAnswer: { "@type": "Answer", text: "Only if the graded price exceeds the raw price by more than the grading cost (roughly US$19–75 per card). For most cards under about $50 raw, grading costs more than it adds." } },
        ] }) }} />
    </div>
  );
}
