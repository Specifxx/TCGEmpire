import type { Metadata } from "next";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { buildCardWhere } from "@/lib/cards";
import { DEFAULT_COUNTRY } from "@/lib/country";
import { TYPE_FACETS, typeFacetBySlug, FACET_THIN_THRESHOLD } from "@/lib/facets";
import { FacetPageBody } from "@/components/FacetPageBody";
import { SITE_URL } from "@/lib/site";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";

export const revalidate = 86400;

export async function generateStaticParams() {
  return TYPE_FACETS.map((f) => ({ type: f.slug }));
}

export async function generateMetadata({ params }: { params: { type: string } }): Promise<Metadata> {
  const facet = typeFacetBySlug(params.type);
  if (!facet) return notFoundMetadata("Card type");
  // -1 = "couldn't count" (DB unreachable), which is NOT the same as "few cards".
  // Falling back to 0 would noindex a perfectly good facet page on any transient
  // DB blip; only a CONFIRMED low count should trigger the thin-page guard.
  const total = await prisma.card
    .count({ where: buildCardWhere(facet.query, DEFAULT_COUNTRY) })
    .catch(() => -1);
  // Stepped down like card/[id]/page.tsx and sets/[set]/page.tsx: the previous
  // single fixed string had no length guard — the longest type label pushed it
  // past 60 chars, part of Bing's 397 "Title too long" warnings (small volume
  // here, 6 pages, but fixed for consistency with every other facet template).
  const titleCandidates = [
    `Riftbound ${facet.label} Cards — Prices & Full List`,
    `Riftbound ${facet.label} Cards — Prices`,
    `Riftbound ${facet.label} Cards`,
  ];
  const title =
    titleCandidates.find((t) => `${t} | RiftCompare`.length <= 60) ?? titleCandidates[titleCandidates.length - 1];
  return {
    title: { absolute: `${title} | RiftCompare` },
    description: `${facet.intro} Compare live prices across every store we track.`,
    alternates: pageAlternates(`/cards/type/${facet.slug}`),
    // A real page with genuine unique copy either way — noindex only guards
    // against a page whose ONLY content would be a near-empty card grid.
    ...(total >= 0 && total < FACET_THIN_THRESHOLD ? { robots: { index: false, follow: true } } : {}),
    openGraph: pageOpenGraph({ title: `${title} | RiftCompare`, description: facet.intro, url: `/cards/type/${facet.slug}` }),
  };
}

export default async function CardTypeFacetPage({ params }: { params: { type: string } }) {
  const facet = typeFacetBySlug(params.type);
  if (!facet) notFound();
  return <FacetPageBody facet={facet} dimensionLabel="card type" crumbLabel="Type" crumbHref="/cards/type" siblings={TYPE_FACETS} collectionKind="type" />;
}
