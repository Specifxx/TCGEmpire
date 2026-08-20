import type { Metadata } from "next";
import Link from "next/link";
import { SuggestStoreForm } from "@/components/SuggestStoreForm";
import { RETAILER_LIST } from "@/lib/retailers";
import { SITE_URL } from "@/lib/site";
import { pageAlternates } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export const metadata: Metadata = {
  title: "Suggest a Store — Get Listed on RiftCompare",
  description:
    "Run a store that sells Riftbound: League of Legends TCG singles? Suggest it and we'll add it to RiftCompare's price comparison — free listing, more customers.",
  alternates: pageAlternates("/stores/suggest"),
  openGraph: {
    title: "Suggest a Store — Get Listed on RiftCompare",
    description: "Sell Riftbound cards? Get your store listed on RiftCompare's price comparison, free.",
    url: `${SITE_URL}/stores/suggest`,
  },
};

export default function SuggestStorePage() {
  const storeCount = RETAILER_LIST.length;

  return (
    <div className="mx-auto max-w-xl">
      <Breadcrumbs
        className="mb-4"
        trail={[
          { name: "Stores", href: "/stores/tracked" },
          { name: "Suggest a store", href: "/stores/suggest" },
        ]}
      />

      <div className="card-surface overflow-hidden">
        <div className="border-l-2 border-brand-500 bg-ink-900 px-6 py-7">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-brand-500/30 bg-brand-500/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-brand-300">
            + Add a store
          </span>
          <h1 className="mt-3 text-2xl font-extrabold text-white">Suggest a store</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Know a shop that sells Riftbound singles we&apos;re missing? Run one yourself? Tell us and we&apos;ll add it
            to the comparison. We already track <strong className="text-white">{storeCount}+ stores</strong> across
            Australia, the US, the UK, Singapore, Canada and Germany — the more we list, the better the deals for everyone.
          </p>
        </div>

        <div className="p-6">
          <SuggestStoreForm />
        </div>
      </div>

      {/* Value prop for store owners — this page doubles as a partnership pitch */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Perk icon="🛒" title="Free to list">
          No cost, ever. We compare prices to help shoppers find the best deal.
        </Perk>
        <Perk icon="📈" title="More customers">
          Buyers comparing prices get sent straight to your product page.
        </Perk>
        <Perk icon="⚡" title="Automatic">
          Shopify stores sync live prices automatically once added — nothing for you to maintain.
        </Perk>
      </div>

      <p className="mt-5 text-center text-xs text-slate-500">
        Prefer email? <Link href="/contact" className="text-brand-400 hover:underline">Contact us →</Link> · See who we
        already compare on the <Link href="/stores/tracked" className="text-brand-400 hover:underline">tracked stores</Link> page.
      </p>
    </div>
  );
}

function Perk({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 p-4 text-center">
      <div className="text-xl">{icon}</div>
      <div className="mt-1 text-sm font-bold text-white">{title}</div>
      <div className="mt-1 text-xs leading-relaxed text-slate-400">{children}</div>
    </div>
  );
}
