import type { Metadata } from "next";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { buildCardWhere } from "@/lib/cards";
import { DEFAULT_COUNTRY } from "@/lib/country";
import { RARITY_FACETS, rarityFacetBySlug, FACET_THIN_THRESHOLD } from "@/lib/facets";
import { FacetPageBody } from "@/components/FacetPageBody";
import { SITE_URL } from "@/lib/site";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";

export const revalidate = 86400;

export async function generateStaticParams() {
  return RARITY_FACETS.map((f) => ({ rarity: f.slug }));
}

export async function generateMetadata({ params }: { params: { rarity: string } }): Promise<Metadata> {
  const facet = rarityFacetBySlug(params.rarity);
  if (!facet) return notFoundMetadata("Rarity");
  // -1 = "couldn't count" (DB unreachable), which is NOT the same as "few cards".
  // Falling back to 0 would noindex a perfectly good facet page on any transient
  // DB blip; only a CONFIRMED low count should trigger the thin-page guard.
  const total = await prisma.card
    .count({ where: buildCardWhere(facet.query, DEFAULT_COUNTRY) })
    .catch(() => -1);
  const title = `Riftbound ${facet.label} Cards — Prices & Full List | RiftCompare`;
  return {
    title: { absolute: title },
    description: `${facet.intro} Compare live prices across every store we track.`,
    alternates: pageAlternates(`/cards/rarity/${facet.slug}`),
    ...(total >= 0 && total < FACET_THIN_THRESHOLD ? { robots: { index: false, follow: true } } : {}),
    openGraph: pageOpenGraph({ title, description: facet.intro, url: `/cards/rarity/${facet.slug}` }),
  };
}

export default async function CardRarityFacetPage({ params }: { params: { rarity: string } }) {
  const facet = rarityFacetBySlug(params.rarity);
  if (!facet) notFound();
  return <FacetPageBody facet={facet} dimensionLabel="rarity" crumbLabel="Rarity" crumbHref="/cards/rarity" siblings={RARITY_FACETS} collectionKind="rarity" />;
}
