import type { Metadata } from "next";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { buildCardWhere } from "@/lib/cards";
import { DEFAULT_COUNTRY } from "@/lib/country";
import { PRINTING_FACETS, printingFacetBySlug, FACET_THIN_THRESHOLD } from "@/lib/facets";
import { FacetPageBody } from "@/components/FacetPageBody";
import { SITE_URL } from "@/lib/site";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";

export const revalidate = 86400;

export async function generateStaticParams() {
  return PRINTING_FACETS.map((f) => ({ printing: f.slug }));
}

export async function generateMetadata({ params }: { params: { printing: string } }): Promise<Metadata> {
  const facet = printingFacetBySlug(params.printing);
  if (!facet) return notFoundMetadata("Printing");
  // -1 = "couldn't count" (DB unreachable), which is NOT the same as "few cards".
  // Falling back to 0 would noindex a perfectly good facet page on any transient
  // DB blip; only a CONFIRMED low count should trigger the thin-page guard.
  const total = await prisma.card
    .count({ where: buildCardWhere(facet.query, DEFAULT_COUNTRY) })
    .catch(() => -1);
  // Stepped down like card/[id]/page.tsx and sets/[set]/page.tsx: the previous
  // single fixed string had no length guard — "Alternate Art", the longest
  // printing label, pushed it well past 60 chars, part of Bing's 397 "Title
  // too long" warnings.
  const titleCandidates = [
    `Riftbound ${facet.label} Printings — Prices & Full List`,
    `Riftbound ${facet.label} Printings — Prices`,
    `Riftbound ${facet.label} Printings`,
  ];
  const title =
    titleCandidates.find((t) => `${t} | RiftCompare`.length <= 60) ?? titleCandidates[titleCandidates.length - 1];
  return {
    title: { absolute: `${title} | RiftCompare` },
    description: `${facet.intro} Compare live prices across every store we track.`,
    alternates: pageAlternates(`/cards/printing/${facet.slug}`),
    ...(total >= 0 && total < FACET_THIN_THRESHOLD ? { robots: { index: false, follow: true } } : {}),
    openGraph: pageOpenGraph({ title: `${title} | RiftCompare`, description: facet.intro, url: `/cards/printing/${facet.slug}` }),
  };
}

export default async function CardPrintingFacetPage({ params }: { params: { printing: string } }) {
  const facet = printingFacetBySlug(params.printing);
  if (!facet) notFound();
  return <FacetPageBody facet={facet} dimensionLabel="printing" crumbLabel="Printing" crumbHref="/cards/printing" siblings={PRINTING_FACETS} collectionKind="printing" />;
}
