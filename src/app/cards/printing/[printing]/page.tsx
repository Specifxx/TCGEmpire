import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { buildCardWhere } from "@/lib/cards";
import { DEFAULT_COUNTRY } from "@/lib/country";
import { PRINTING_FACETS, printingFacetBySlug, FACET_THIN_THRESHOLD } from "@/lib/facets";
import { FacetPageBody } from "@/components/FacetPageBody";
import { SITE_URL } from "@/lib/site";

export const revalidate = 86400;

export async function generateStaticParams() {
  return PRINTING_FACETS.map((f) => ({ printing: f.slug }));
}

export async function generateMetadata({ params }: { params: { printing: string } }): Promise<Metadata> {
  const facet = printingFacetBySlug(params.printing);
  if (!facet) return {};
  // -1 = "couldn't count" (DB unreachable), which is NOT the same as "few cards".
  // Falling back to 0 would noindex a perfectly good facet page on any transient
  // DB blip; only a CONFIRMED low count should trigger the thin-page guard.
  const total = await prisma.card
    .count({ where: buildCardWhere(facet.query, DEFAULT_COUNTRY) })
    .catch(() => -1);
  const title = `Riftbound ${facet.label} Printings — Prices & Full List | RiftCompare`;
  return {
    title: { absolute: title },
    description: `${facet.intro} Compare live prices across every store we track.`,
    alternates: { canonical: `/cards/printing/${facet.slug}` },
    ...(total >= 0 && total < FACET_THIN_THRESHOLD ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title, description: facet.intro, url: `${SITE_URL}/cards/printing/${facet.slug}` },
  };
}

export default async function CardPrintingFacetPage({ params }: { params: { printing: string } }) {
  const facet = printingFacetBySlug(params.printing);
  if (!facet) notFound();
  return <FacetPageBody facet={facet} dimensionLabel="printing" crumbLabel="Printing" crumbHref="/cards/printing" siblings={PRINTING_FACETS} />;
}
