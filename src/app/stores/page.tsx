import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { SITE_URL, CONTACT_EMAIL } from "@/lib/site";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { RETAILER_LIST } from "@/lib/retailers";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "RiftCompare for Stores — Pricing Intelligence for Riftbound Retailers",
  description:
    "Sell Riftbound? RiftCompare already compares your prices against every competitor, daily. Get the same intelligence we use: a live repricing report showing exactly where you're winning, losing, and leaving margin on the table.",
  alternates: { canonical: "/stores" },
};

const PITCH = [
  {
    emoji: "🎯",
    title: "See every card where you're beaten",
    body: "A live list of your listings priced above the market's cheapest — with the exact gap, so repricing takes minutes, not a day of tab-hopping.",
  },
  {
    emoji: "🥇",
    title: "Know where you're already winning",
    body: "Your cheapest-in-market count, win rate by set, and where you have headroom to nudge prices UP without losing the top spot.",
  },
  {
    emoji: "📈",
    title: "Powered by the data buyers already use",
    body: "RiftCompare sends shoppers to the cheapest store every day. This is the same comparison, turned around to face you.",
  },
];

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
            provider: { "@type": "Organization", name: "RiftCompare", url: SITE_URL },
          }),
        }}
      />

      <div className="card-surface overflow-hidden">
        <div className="bg-gradient-to-br from-brand-600/25 via-ink-850 to-gold/15 px-6 py-10 text-center">
          <span className="chip mb-3 inline-flex bg-brand-500/15 font-bold uppercase tracking-wide text-brand-300">For stores</span>
          <h1 className="mx-auto max-w-xl font-display text-3xl font-extrabold text-white">
            Know exactly where your prices stand — every day
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-300">
            RiftCompare compares {listings.toLocaleString()} live listings across {stores} stores daily and
            sends buyers to the cheapest one. Partner stores get that same comparison pointed at
            their own catalogue: a private, always-current repricing report.
          </p>
          <a href={`mailto:${CONTACT_EMAIL}?subject=Store%20repricing%20report`} className="btn-primary mt-5 inline-block">
            Request your store&apos;s report →
          </a>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {PITCH.map((p) => (
          <div key={p.title} className="card-surface p-4">
            <span className="text-xl" aria-hidden>{p.emoji}</span>
            <h2 className="mt-1.5 text-sm font-bold text-white">{p.title}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{p.body}</p>
          </div>
        ))}
      </div>

      <div className="card-surface mt-6 p-5">
        <h2 className="font-bold text-white">How it works</h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-slate-400">
          <li>Email us from your store&apos;s address — we confirm which catalogue is yours.</li>
          <li>You get a private link to your live report (no login, no install — share it with your team).</li>
          <li>The report updates with every daily price refresh. Reprice, win the comparison, sell more.</li>
        </ol>
        <p className="mt-3 text-xs text-slate-500">
          Free for partner stores while the programme is in its pilot. Your data stays yours — the
          report shows market aggregates, never another store&apos;s private information beyond the
          public prices everyone can already see.
        </p>
      </div>

      <p className="mt-6 text-center text-xs text-slate-600">
        Already a partner? Open the private report link we sent you.{" "}
        <Link href="/contact" className="text-brand-400 hover:underline">Lost it?</Link>
      </p>
    </div>
  );
}
