import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { SETS } from "@/lib/constants";
import { getPopularCards } from "@/lib/cheapest-cards";
import { CardTile } from "@/components/CardTile";
import { HubIntro } from "@/components/HubIntro";
import { SITE_URL } from "@/lib/site";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";

// /gallery — added 2026-08-20 to target the "Riftbound card gallery" query
// directly. Every set already has its own full-art gallery
// (/sets/<set>/gallery — see that file's own doc comment: built after Search
// Console showed real impressions for "vendetta card gallery" /
// "riftbound vendetta gallery" queries sitting around position 8), but there
// was no single page for the general, set-agnostic query. This is that page:
// a real hub, not a duplicate — it does not re-render any set's card grid
// itself (that stays on the per-set page, which needs the full tile count to
// be a genuine gallery), it links to each one and shows a live, real
// highlight strip so the page has genuine content of its own rather than
// being a bare link list.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: { absolute: "Riftbound Card Gallery — Every Set, Every Card | RiftCompare" },
  description:
    "The full Riftbound card gallery — every set's cards in one visual browse, with live prices. Origins, Spirit Forged, Unleashed, Vendetta and more.",
  alternates: pageAlternates("/gallery"),
  openGraph: pageOpenGraph({
    title: "Riftbound Card Gallery",
    description: "Every Riftbound set's cards in one visual browse, with live prices.",
    url: "/gallery",
  }),
};

export default async function GalleryIndexPage() {
  const [counts, highlights] = await Promise.all([
    prisma.card.groupBy({ by: ["setCode"], _count: { _all: true } }),
    getPopularCards(12),
  ]);
  const countByCode = new Map(counts.map((c) => [c.setCode, c._count._all]));
  const released = SETS.map((s) => ({ ...s, cards: countByCode.get(s.code) ?? 0 })).filter(
    (s) => !s.comingSoon && s.cards > 0
  );

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Gallery", item: `${SITE_URL}/gallery` },
    ],
  };
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Riftbound set galleries",
    itemListElement: released.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `${s.name} gallery`,
      url: `${SITE_URL}/sets/${s.slug}/gallery`,
    })),
  };

  return (
    <div className="flex flex-col gap-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbLd, itemListLd]) }} />

      <div>
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <span className="text-slate-300">Gallery</span>
        </nav>
        <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Riftbound card gallery</h1>
        <HubIntro path="/gallery" />
      </div>

      {highlights.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-extrabold text-white">Trending right now</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6">
            {highlights.map((c) => (
              <CardTile key={c.id} card={c} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-extrabold text-white">Browse the gallery by set</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {released.map((s) => (
            <Link
              key={s.slug}
              href={`/sets/${s.slug}/gallery`}
              className="card-surface flex items-center justify-between gap-2 p-4 transition-colors hover:border-brand-500"
            >
              <div>
                <h3 className="text-base font-extrabold text-white">{s.name}</h3>
                <p className="text-xs text-slate-500">Every card, full art, one page</p>
              </div>
              <span className="text-xs font-semibold text-slate-500">{s.cards.toLocaleString()} cards →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="card-surface p-6">
        <h2 className="text-xl font-extrabold text-white">Looking for prices instead of art?</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          The gallery is for looking, not filtering — for that, browse cards by{" "}
          <Link href="/cards" className="text-brand-400 hover:underline">type, rarity or printing</Link>, see every{" "}
          <Link href="/cards/rarity" className="text-brand-400 hover:underline">rarity tier explained</Link>, or use the{" "}
          <Link href="/browse" className="text-brand-400 hover:underline">full filterable card database</Link> to search and sort every card at once.
        </p>
      </section>
    </div>
  );
}
