import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { RARITY_FACETS } from "@/lib/facets";
import { HubIntro } from "@/components/HubIntro";
import { SITE_URL } from "@/lib/site";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";

// /cards/rarity — the rarity-system hub, added 2026-08-20 to target the
// "Riftbound cards rarity" query directly and to fix a real gap in the site's
// own structure: FacetPageBody.tsx's crumbHref comment documents that this
// exact URL used to be linked from every /cards/rarity/[rarity] breadcrumb
// and BreadcrumbList JSON-LD before that was found to 404 (scripts/content-
// quality.ts, see GROWTH-AUDIT.md § 4) and downgraded to unlinked plain text.
// This page is the actual fix — the breadcrumb workaround stays in place
// (it's shared by /cards/type and /cards/printing, which still have no index
// of their own), but /cards/rarity is now a real, crawlable destination
// rather than a documented dead end.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: { absolute: "Riftbound Cards by Rarity — Every Tier Explained | RiftCompare" },
  description:
    "Every Riftbound card rarity explained — Common, Uncommon, Rare, Epic and Showcase — with the full card list and live prices for each tier.",
  alternates: pageAlternates("/cards/rarity"),
  openGraph: pageOpenGraph({
    title: "Riftbound Cards by Rarity",
    description: "Every Riftbound rarity tier explained, with the full card list and live prices for each.",
    url: "/cards/rarity",
  }),
};

export default async function CardsByRarityPage() {
  const counts = await prisma.card
    .groupBy({ by: ["rarity"], _count: { _all: true } })
    .catch(() => [] as { rarity: string; _count: { _all: number } }[]);
  const countByLabel = new Map(counts.map((c) => [c.rarity, c._count._all]));

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Cards", item: `${SITE_URL}/cards` },
      { "@type": "ListItem", position: 3, name: "Rarity", item: `${SITE_URL}/cards/rarity` },
    ],
  };
  // A real, ordered list of the thing this page is actually about — every
  // rarity tier — for the same reason the set-gallery and other listicle-
  // shaped pages carry one: it's a genuine ItemList, not decoration.
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Riftbound card rarities",
    itemListElement: RARITY_FACETS.map((f, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `${f.label} cards`,
      url: `${SITE_URL}/cards/rarity/${f.slug}`,
    })),
  };

  return (
    <div className="flex flex-col gap-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbLd, itemListLd]) }} />

      <div>
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <Link href="/cards" className="hover:text-slate-300">Cards</Link>
          <span>/</span>
          <span className="text-slate-300">Rarity</span>
        </nav>
        <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Riftbound cards by rarity</h1>
        <HubIntro path="/cards/rarity" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {RARITY_FACETS.map((f) => {
          const n = countByLabel.get(f.label) ?? 0;
          return (
            <Link
              key={f.slug}
              href={`/cards/rarity/${f.slug}`}
              className="card-surface flex flex-col gap-1.5 p-4 transition-colors hover:border-brand-500"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-extrabold text-white">{f.label}</h2>
                {n > 0 && <span className="text-xs font-semibold text-slate-500">{n.toLocaleString()} cards</span>}
              </div>
              <p className="text-sm leading-relaxed text-slate-400">{f.intro}</p>
              <span className="mt-1 text-sm font-semibold text-brand-400">See every {f.label} card & its price →</span>
            </Link>
          );
        })}
      </div>

      <section className="card-surface p-6">
        <h2 className="text-xl font-extrabold text-white">Looking for a different way to browse?</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          Rarity is only one cut of the database — see every card by{" "}
          <Link href="/cards" className="text-brand-400 hover:underline">type, domain and printing</Link>, browse the{" "}
          <Link href="/gallery" className="text-brand-400 hover:underline">full visual card gallery</Link>, or use the{" "}
          <Link href="/browse" className="text-brand-400 hover:underline">filterable card database</Link> to search and sort every filter at once.
        </p>
      </section>
    </div>
  );
}
