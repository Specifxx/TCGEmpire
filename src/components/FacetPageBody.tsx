import Link from "next/link";
import { prisma } from "@/lib/db";
import { buildCardWhere, buildCardOrderBy, cardTileSelect } from "@/lib/cards";
import { DEFAULT_COUNTRY, priceField, COUNTRIES } from "@/lib/country";
import { CardTile } from "./CardTile";
import { formatMoney } from "@/lib/format";
import { SITE_URL } from "@/lib/site";
import { buildCollectionNarrative, type CollectionKind } from "@/lib/content/collection-narrative";
import { getSiteMedianCents } from "@/lib/content/site-median";
import type { Facet } from "@/lib/facets";

// Bounded render — a "Unit" or "Common" facet can run into the hundreds of cards,
// and an unbounded server-rendered grid is exactly the kind of thing that
// regresses Core Web Vitals without being measured first. Capped at the same
// order of magnitude as the site's other galleries (embeds/similar-cards rails
// take 12-24); this is the top end of that range because the whole page IS the
// grid. Anyone who wants the rest gets a real link to the same filter in /browse,
// which already paginates.
const RENDER_CAP = 60;

// Shared body for every /cards/<dimension>/<value> facet page — one query shape
// (buildCardWhere, from lib/cards.ts) so a facet page and the equivalent /browse
// checkbox can never disagree on what counts as a match.
export async function FacetPageBody({
  facet,
  dimensionLabel,
  crumbLabel,
  crumbHref,
  siblings,
  collectionKind = "type",
}: {
  facet: Facet;
  dimensionLabel: string; // "card type" | "rarity" | "printing" — used in copy
  crumbLabel: string; // "Type" | "Rarity" | "Printing" — breadcrumb segment
  crumbHref: string; // "/cards/type" etc — breadcrumb + sibling link base
  siblings: Facet[]; // other values in the same dimension, for cross-links
  /** Which kind of collection this is, for the generated intro's buyer advice. */
  collectionKind?: CollectionKind;
}) {
  const country = DEFAULT_COUNTRY;
  const field = priceField(country);
  const where = buildCardWhere(facet.query, country);

  const [total, priced, agg, cards] = await Promise.all([
    prisma.card.count({ where }),
    prisma.card.count({ where: { ...where, [field]: { not: null } } }),
    prisma.card.aggregate({ where, _min: { [field]: true }, _max: { [field]: true } } as never),
    prisma.card.findMany({
      where,
      orderBy: buildCardOrderBy("price_desc", country),
      take: RENDER_CAP,
      select: cardTileSelect(country),
    }),
  ]);
  const min = (agg as unknown as Record<string, Record<string, number | null>>)._min[field];
  const max = (agg as unknown as Record<string, Record<string, number | null>>)._max[field];

  // A generated, page-specific editorial intro from this facet's own live data:
  // scale and price coverage, the range, where the value is concentrated,
  // which cards matter, and what a buyer should do with that. `facet.intro` (a
  // hand-written line per value) stays as the lead sentence — this is what turns
  // the rest of the page from a grid with a caption into something worth
  // indexing. See docs/adsense-remediation.md § Phase 7c.
  const siteMedianCents = await getSiteMedianCents(country);
  const intro = buildCollectionNarrative({
    kind: collectionKind,
    label: facet.label,
    currency: COUNTRIES[country].currency,
    place: COUNTRIES[country].place,
    members: cards.map((c) => ({
      name: c.name,
      priceCents: (c as unknown as Record<string, number | null>)[field] ?? null,
      setCode: c.setCode,
      rarity: c.rarity,
      collectorNumber: c.collectorNumber,
    })),
    siteMedianCents,
  });

  const browseHref = `/browse?${Object.entries(facet.query)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&")}`;

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Cards", item: `${SITE_URL}/cards` },
      { "@type": "ListItem", position: 3, name: crumbLabel, item: `${SITE_URL}${crumbHref}` },
      { "@type": "ListItem", position: 4, name: facet.label, item: `${SITE_URL}${crumbHref}/${facet.slug}` },
    ],
  };
  const itemListLd =
    cards.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `Riftbound ${facet.label} cards`,
          url: `${SITE_URL}${crumbHref}/${facet.slug}`,
          itemListElement: cards.map((c, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: c.name,
            url: `${SITE_URL}/card/${c.slug ?? c.id}`,
          })),
        }
      : null;

  return (
    <div className="flex flex-col gap-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbLd, ...(itemListLd ? [itemListLd] : [])]) }}
      />

      <div>
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <Link href="/cards" className="hover:text-slate-300">Cards</Link>
          <span>/</span>
          <Link href={crumbHref} className="hover:text-slate-300">{crumbLabel}</Link>
          <span>/</span>
          <span className="text-slate-300">{facet.label}</span>
        </nav>
        <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
          Riftbound {facet.label} cards — prices &amp; full list
        </h1>
        <div className="mt-3 max-w-3xl space-y-2.5 text-sm leading-relaxed text-slate-400">
          <p>
            {facet.intro}{" "}
            {total > 0
              ? `Tracking ${total.toLocaleString()} card${total === 1 ? "" : "s"}, ${priced.toLocaleString()} priced right now.`
              : `We're tracking this ${dimensionLabel} — cards will appear here as they're priced.`}
          </p>
          {intro.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        {min != null && max != null && (
          <p className="mt-1 text-xs text-slate-500">
            Prices from {formatMoney(min, COUNTRIES[country].currency)} to {formatMoney(max, COUNTRIES[country].currency)} across every store we track
            ({COUNTRIES[country].label} baseline — switch markets on any card page).
          </p>
        )}
      </div>

      {cards.length === 0 ? (
        <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
          <div>
            <p className="text-lg font-semibold text-white">No {facet.label.toLowerCase()} cards priced yet</p>
            <Link href="/browse" className="btn-primary mt-4">Browse all cards</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {cards.map((c) => (
              <CardTile key={c.id} card={c} />
            ))}
          </div>
          {total > RENDER_CAP && (
            <p className="text-center text-sm text-slate-500">
              Showing the {RENDER_CAP} highest-value of {total.toLocaleString()} cards —{" "}
              <Link href={browseHref} className="text-brand-400 hover:underline">see all {total.toLocaleString()} in Browse →</Link>
            </p>
          )}
        </>
      )}

      {siblings.length > 1 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-white">Other {dimensionLabel}s</h2>
          <div className="flex flex-wrap gap-2">
            {siblings.filter((s) => s.slug !== facet.slug).map((s) => (
              <Link key={s.slug} href={`${crumbHref}/${s.slug}`} className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-brand-500">
                {s.label}
              </Link>
            ))}
            <Link href="/cards" className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-brand-500">All facets →</Link>
          </div>
        </section>
      )}

    </div>
  );
}
