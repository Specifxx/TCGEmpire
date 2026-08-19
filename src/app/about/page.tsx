import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { CONTACT_EMAIL, SITE_NAME, SITE_URL } from "@/lib/site";
import { pageAlternates } from "@/lib/seo";
import { HowItWorks } from "@/components/home/HowItWorks";

// This page had no DB read at all before HowItWorks (below) needed a live
// card count for its subhead — a daily revalidation window is plenty fresh
// for a number that only grows by a set's worth of cards every few weeks,
// same convention /sets already uses for its own per-set counts.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "About RiftCompare",
  description:
    "RiftCompare is an independent price-comparison and database for Riftbound: League of Legends TCG — how it started, how it works, and who's behind it.",
  alternates: pageAlternates("/about"),
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "About", item: `${SITE_URL}/about` },
  ],
};
const aboutLd = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  name: `About ${SITE_NAME}`,
  url: `${SITE_URL}/about`,
  description:
    "How RiftCompare sources Riftbound: League of Legends TCG prices, our data methodology, the stores and markets we cover, and who's behind it.",
  publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
};

export default async function AboutPage() {
  const totalCards = await prisma.card.count();
  return (
    <article className="mx-auto max-w-3xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbLd, aboutLd]) }}
      />
      <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-slate-300">Home</Link>
        <span>/</span>
        <span className="text-slate-300">About</span>
      </nav>
      <h1 className="text-3xl font-extrabold leading-tight text-white">About {SITE_NAME}</h1>
      <p className="mt-2 text-sm text-slate-500">An independent community project for Riftbound players.</p>

      <div className="mt-6 space-y-6 border-t border-ink-800 pt-6 text-sm leading-relaxed text-slate-300">
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">What RiftCompare is</h2>
          <p>
            {SITE_NAME} is a free price-comparison tool and card database for{" "}
            <strong className="text-white">Riftbound: League of Legends TCG</strong>. We track live prices
            for every Riftbound card across dozens of stores in Australia, New Zealand, the United States,
            the United Kingdom, Singapore and Canada, and show you the cheapest place to buy — alongside
            price history, set checklists, sealed-product prices, deck pricing and more. Everything is free
            to use, with no account required.
          </p>
        </section>

        {/* The homepage's old three-step "search → compare → buy" explainer,
            unchanged — moved here per the homepage-redesign brief (the
            homepage itself now proves the same point with a live example,
            ProofStrip, instead of describing it). This is the one place on
            the site that still spells the mechanic out for a first-time
            visitor who lands directly on /about rather than the homepage. */}
        <HowItWorks totalCards={totalCards} />

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Why we built it</h2>
          <p>
            Riftbound is a brand-new game, and the same card can cost wildly different amounts from shop
            to shop — with stock and prices changing daily. Checking a dozen stores by hand is tedious,
            and overseas sites quietly show you the wrong currency. We built {SITE_NAME} to do that
            legwork automatically, so players can spend less time hunting and more time playing.
          </p>
        </section>

        <section id="methodology" className="scroll-mt-24 space-y-2">
          <h2 className="text-lg font-bold text-white">How it works</h2>
          <p>
            Several times a day we collect public price and stock information from store catalogues and
            marketplaces, match each listing to the correct card and printing, and record the lowest live
            price per market. Those daily snapshots also power our{" "}
            <Link href="/movers" className="text-brand-400 hover:underline">price movers</Link>, the{" "}
            <Link href="/market" className="text-brand-400 hover:underline">RiftCompare Index</Link> and
            every card&rsquo;s price-history chart. We only ever use publicly available information and we
            always request each store&rsquo;s local price, so the numbers you see are what you&rsquo;d
            actually pay.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">How we stay free</h2>
          <p>
            {SITE_NAME} is funded by advertising and by affiliate commissions: some outbound links to
            retailers (such as eBay, Amazon and TCGplayer) are affiliate links, and we may earn a small
            commission if you buy through them — at no extra cost to you. This never changes the prices we
            show or the order results appear in: the cheapest option is always shown first, full stop.
            You can read the details in our{" "}
            <Link href="/privacy" className="text-brand-400 hover:underline">Privacy Policy</Link>.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Independent &amp; community-made</h2>
          <p>
            {SITE_NAME} is an independent project, not affiliated with or endorsed by Riot Games or any
            store we compare. Card names and artwork are the property of their respective owners and are
            used to identify the cards being priced. We also run a sister site,{" "}
            <a href="https://dexcompare.app" target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline">DexCompare</a>,
            for the Pokémon TCG — and{" "}
            <a href="https://riftboundstocks.com" target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline">RiftboundStocks.com</a>,
            for treating Riftbound cards like they&rsquo;re on a stock ticker.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Get in touch</h2>
          <p>
            Spotted a wrong price, want your store added, or have an idea? We genuinely want to hear it —
            email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold hover:underline">{CONTACT_EMAIL}</a>{" "}
            or use the <Link href="/contact" className="text-brand-400 hover:underline">contact page</Link>.
          </p>
        </section>
      </div>
    </article>
  );
}
