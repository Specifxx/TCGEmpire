import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { buildCardWhere } from "@/lib/cards";
import { DEFAULT_COUNTRY } from "@/lib/country";
import { TYPE_FACETS, typeFacetBySlug, FACET_THIN_THRESHOLD } from "@/lib/facets";
import { FacetPageBody } from "@/components/FacetPageBody";
import { SITE_URL } from "@/lib/site";

export const revalidate = 86400;

export async function generateStaticParams() {
  return TYPE_FACETS.map((f) => ({ type: f.slug }));
}

export async function generateMetadata({ params }: { params: { type: string } }): Promise<Metadata> {
  const facet = typeFacetBySlug(params.type);
  if (!facet) return {};
  const total = await prisma.card.count({ where: buildCardWhere(facet.query, DEFAULT_COUNTRY) }).catch(() => 0);
  const title = `Riftbound ${facet.label} Cards — Prices & Full List | RiftCompare`;
  return {
    title: { absolute: title },
    description: `${facet.intro} Compare live prices across every store we track.`,
    alternates: { canonical: `/cards/type/${facet.slug}` },
    // A real page with genuine unique copy either way — noindex only guards
    // against a page whose ONLY content would be a near-empty card grid.
    ...(total < FACET_THIN_THRESHOLD ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title, description: facet.intro, url: `${SITE_URL}/cards/type/${facet.slug}` },
  };
}

export default async function CardTypeFacetPage({ params }: { params: { type: string } }) {
  const facet = typeFacetBySlug(params.type);
  if (!facet) notFound();
  return <FacetPageBody facet={facet} dimensionLabel="card type" crumbLabel="Type" crumbHref="/cards/type" siblings={TYPE_FACETS} />;
}
