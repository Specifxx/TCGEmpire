import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { SITE_URL, CONTACT_EMAIL } from "@/lib/site";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { RETAILER_LIST } from "@/lib/retailers";
import { pageAlternates } from "@/lib/seo";
import { RelatedGuides } from "@/components/RelatedGuides";
import { guidesForTool } from "@/lib/content/tool-guides";
import { STORE_PLAN_AMOUNT, STORE_PLAN_FEATURES, storePlanEnabled } from "@/lib/store-plan";
import { StorePlanSignup } from "@/components/stores/StorePlanSignup";

// A day (an hour until 2026-10-14, DECISIONS.md, "Cached pages refresh every 6
// to 24 hours", 2026-10-14): the store list and its counts move once a day at
// most.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "RiftCompare for Stores — The Stores Plan for Riftbound Retailers",
  description:
    "Sell Riftbound? The Stores plan gives you a live repricing report against every competitor we track, what buyers are searching for in your market, a Verified store mark on your store page, and Premium. Paying never changes your place in any comparison.",
  alternates: pageAlternates("/stores"),
};

export default async function StoresPage() {
  // "Stores" means real, currently-tracked retailers — RETAILER_LIST.length, the
  // same single source of truth /stores/tracked uses — NOT a raw distinct count of
  // every `retailer` key that has ever appeared in RetailerPrice. That raw count
  // included eBay/marketguide/TCGplayer/Cardmarket pseudo-retailers (never real
  // local stores) and any store since removed from retailers.ts whose old rows
  // were never deleted, so this page and /stores/tracked disagreed (110 vs 142)
  // about how many stores the site tracks — the same drift the homepage's own
  // stat line fixed for the same reason (see the note in app/page.tsx). Listings
  // are restricted to the SAME trusted key set for the same reason, so the two
  // numbers on this page describe the same set of stores as each other.
  const validRetailerKeys = RETAILER_LIST.map((r) => r.key);
  const stores = RETAILER_LIST.length;
  // Read at render time, so switching STRIPE_STORE_PRICE_ID on shows the form
  // from the next regeneration without a code change.
  const enabled = storePlanEnabled();
  const listings = await prisma.retailerPrice
    .count({ where: { inStock: true, retailer: { in: validRetailerKeys } } })
    .catch(() => 0);

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumbs trail={[{ name: "Stores", href: "/stores" }]} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Service",
            name: "RiftCompare for Stores",
            description: "Live repricing intelligence for Riftbound retailers.",
            offers: { "@type": "Offer", price: STORE_PLAN_AMOUNT.replace(/[^0-9.]/g, ""), priceCurrency: "USD" },
            provider: { "@type": "Organization", name: "RiftCompare", url: SITE_URL },
          }),
        }}
      />

      <div className="card-surface overflow-hidden">
        <div className="bg-gradient-to-br from-brand-600/25 via-ink-850 to-gold/15 px-6 py-10 text-center">
          <span className="chip mb-3 inline-flex bg-brand-500/15 font-bold uppercase tracking-wide text-brand-300">The Stores plan</span>
          <h1 className="mx-auto max-w-xl font-display text-3xl font-extrabold text-white">
            Know exactly where your prices stand — every day
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-300">
            RiftCompare compares {listings.toLocaleString()} live listings across {stores} stores and sends buyers to
            the cheapest one. The Stores plan points that same comparison at your own catalogue.
          </p>
          <p className="mt-4 font-display text-3xl font-extrabold text-white">
            {STORE_PLAN_AMOUNT}
            <span className="text-base font-semibold text-slate-400"> / month (USD)</span>
          </p>
          <a href="#subscribe" className="btn-primary mt-4 inline-block">
            {enabled ? "Subscribe →" : "Ask about the plan →"}
          </a>
        </div>
      </div>

      {/* THE HARD RULE, said where a store decides to pay (DECISIONS.md, "The
          Stores plan", 2026-10-23; /editorial-policy#money). */}
      <p className="card-surface mt-6 border border-brand-500/30 p-4 text-sm leading-relaxed text-slate-300">
        <strong className="text-white">Paying never changes your place in any comparison.</strong> Card pages, store
        lists, Best Basket and every other comparison treat a store on the plan exactly like every other store: the
        same prices, in the same order. The plan buys information about your own prices and a mark on your own store page —
        never a position.
      </p>

      {/* The free alternative, for a shop that won't take on a monthly fee
          (DECISIONS.md, "Store partner codes", 2026-10-26). */}
      <p className="card-surface mt-4 p-4 text-sm leading-relaxed text-slate-300">
        <strong className="text-white">No monthly fee?</strong> Become a{" "}
        <Link href="/stores/partners" className="text-brand-400 hover:underline">store partner</Link> instead: give our
        shoppers an exclusive code and pay a commission only on the orders it brings you.
      </p>

      <h2 className="mt-8 text-lg font-extrabold text-white">What&apos;s included</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {STORE_PLAN_FEATURES.map((f) => (
          <div key={f.title} className="card-surface p-4">
            <h3 className="text-sm font-bold text-white">{f.title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{f.body}</p>
          </div>
        ))}
      </div>

      <div className="card-surface mt-6 p-5">
        <h2 className="font-bold text-white">How it works</h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-slate-400">
          <li>Subscribe below with your store&apos;s name and website.</li>
          <li>We confirm which tracked store is yours, within a day.</li>
          <li>
            Your private report link arrives by email (no install — share it with your team). It updates with every
            price import, and you add your store page&apos;s description and promo from your{" "}
            <Link href="/stores/account" className="text-brand-400 hover:underline">Stores account</Link>.
          </li>
        </ol>
        <p className="mt-3 text-xs text-slate-500">
          Cancel any time; the report and the Verified mark stop when the paid month ends. Your data stays yours — the
          report shows market aggregates, never another store&apos;s private information beyond the public prices
          everyone can already see. Not tracked yet?{" "}
          <Link href="/stores/suggest" className="text-brand-400 hover:underline">Suggest your store</Link> first.
        </p>
      </div>

      <section id="subscribe" className="card-surface mt-6 scroll-mt-header p-6">
        <h2 className="mb-4 text-center font-bold text-white">
          {enabled ? `Subscribe — ${STORE_PLAN_AMOUNT}/month` : "Get the Stores plan"}
        </h2>
        {enabled ? (
          <StorePlanSignup amount={STORE_PLAN_AMOUNT} />
        ) : (
          <div className="text-center">
            <p className="text-sm text-slate-400">Online signup isn&apos;t open yet. Email us from your store&apos;s address and we&apos;ll set you up.</p>
            <a href={`mailto:${CONTACT_EMAIL}?subject=Store%20repricing%20report`} className="btn-primary mt-4 inline-block">
              Email us →
            </a>
          </div>
        )}
      </section>

      {/* The shopper-side guides to the same stores (lib/content/tool-guides.ts),
          under the pitch rather than in it: a store owner reading this page is
          also reading how buyers are told to choose between stores. */}
      <RelatedGuides guides={guidesForTool("/stores")} />

      <p className="mt-6 text-center text-xs text-slate-600">
        Already a partner? Open the private report link we sent you, or your{" "}
        <Link href="/stores/account" className="text-brand-400 hover:underline">Stores account</Link>.{" "}
        <Link href="/contact" className="text-brand-400 hover:underline">Lost it?</Link>
      </p>
    </div>
  );
}
