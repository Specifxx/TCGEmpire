import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { buildCardWhere } from "@/lib/cards";
import { DEFAULT_COUNTRY } from "@/lib/country";
import { RARITY_FACETS, rarityFacetBySlug, FACET_THIN_THRESHOLD } from "@/lib/facets";
import { FacetPageBody } from "@/components/FacetPageBody";
import { SITE_URL } from "@/lib/site";

export const revalidate = 86400;

export async function generateStaticParams() {
  return RARITY_FACETS.map((f) => ({ rarity: f.slug }));
}

export async function generateMetadata({ params }: { params: { rarity: string } }): Promise<Metadata> {
  const facet = rarityFacetBySlug(params.rarity);
  if (!facet) return {};
  const total = await prisma.card.count({ where: buildCardWhere(facet.query, DEFAULT_COUNTRY) }).catch(() => 0);
  const title = `Riftbound ${facet.label} Cards — Prices & Full List | RiftCompare`;
  return {
    title: { absolute: title },
    description: `${facet.intro} Compare live prices across every store we track.`,
    alternates: { canonical: `/cards/rarity/${facet.slug}` },
    ...(total < FACET_THIN_THRESHOLD ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title, description: facet.intro, url: `${SITE_URL}/cards/rarity/${facet.slug}` },
  };
}

export default async function CardRarityFacetPage({ params }: { params: { rarity: string } }) {
  const facet = rarityFacetBySlug(params.rarity);
  if (!facet) notFound();
  return <FacetPageBody facet={facet} dimensionLabel="rarity" crumbLabel="Rarity" crumbHref="/cards/rarity" siblings={RARITY_FACETS} />;
}
