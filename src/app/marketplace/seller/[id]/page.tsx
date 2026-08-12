import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canViewMarketplaceListings, getSellerRating, MARKETPLACE_PUBLIC } from "@/lib/marketplace";
import { formatMoney } from "@/lib/format";
import { cardDisplayName } from "@/lib/card-name";
import { cardImageAlt } from "@/lib/image-alt";
import { COUNTRIES, DEFAULT_COUNTRY, type Country } from "@/lib/country";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { breadcrumb } from "@/lib/jsonld";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  // Pre-launch these pages are noindex and unreachable to anyone outside the
  // beta allow-list, so nothing here should read the seller's identity out of
  // the database: a static title is both correct and leak-free.
  if (!MARKETPLACE_PUBLIC) {
    return { title: "Seller storefront — Marketplace", robots: { index: false, follow: false } };
  }

  // Launched: every storefront is in the sitemap (lib/sitemap-sections.ts →
  // marketplace()), so a shared "Seller storefront — Marketplace" title across
  // all of them is a duplicate-title cluster in Search Console — which is
  // exactly what scripts/seo-gate.ts caught on the three live sellers. Same
  // treatment as the store pages: name the seller, and vary the description
  // with facts only this seller has.
  const [profile, cheapest, count] = await Promise.all([
    prisma.sellerProfile.findUnique({
      where: { userId: params.id },
      select: { shopName: true, country: true, user: { select: { displayName: true } } },
    }),
    prisma.marketplaceListing.findFirst({
      where: { sellerId: params.id, status: "ACTIVE", quantity: { gt: 0 } },
      orderBy: { priceCents: "asc" },
      select: { priceCents: true, currency: true, card: { select: { name: true } } },
    }),
    prisma.marketplaceListing.count({ where: { sellerId: params.id, status: "ACTIVE", quantity: { gt: 0 } } }),
  ]);
  if (!profile) return notFoundMetadata("Seller");

  const shopName = profile.shopName || profile.user.displayName;
  const place = COUNTRIES[profile.country as Country] ?? COUNTRIES[DEFAULT_COUNTRY];
  // Market in the title because two sellers may pick the same shop name — the
  // same collision lib/store-pages.ts disambiguates for tracked retailers. It
  // still ties if both ship from one market, which would confuse buyers long
  // before it confused a crawler.
  const title = `${shopName} — Riftbound Singles from ${place.label} | RiftCompare Marketplace`;
  const stock = count > 0 ? ` — ${count} card${count === 1 ? "" : "s"} listed` : "";
  const from = cheapest
    ? `, from ${cheapest.card.name} at ${formatMoney(cheapest.priceCents, cheapest.currency)}`
    : "";
  // "shipping from ${place.place}" rather than "a ${place.adjective} seller":
  // the adjectives don't all take the same article ("a Canadian", but "an
  // Australian"), and the ships-from country is the more useful fact anyway.
  const description =
    `Buy Riftbound singles from ${shopName}, shipping from ${place.place}${stock}${from}. ` +
    `See their rating, postage and returns policy, and compare every listing with live store prices.`;

  return {
    title: { absolute: title },
    description,
    alternates: pageAlternates(`/marketplace/seller/${params.id}`),
    openGraph: pageOpenGraph({ title, description, url: `/marketplace/seller/${params.id}` }),
    // Thin guard: a storefront with nothing for sale is a page whose only
    // content is "Nothing listed right now." Still reachable and crawlable,
    // just not submitted for indexing until it has stock.
    ...(count === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

// A seller's public storefront: shop identity, rating, policies, recent reviews
// and their active listings.
export default async function SellerStorefrontPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!canViewMarketplaceListings(user?.email, user?.isAdmin)) notFound();

  const profile = await prisma.sellerProfile.findUnique({
    where: { userId: params.id },
    include: { user: { select: { displayName: true, createdAt: true } } },
  });
  if (!profile) notFound();

  const [rating, reviews, listings] = await Promise.all([
    getSellerRating(params.id),
    prisma.marketplaceReview.findMany({
      where: { sellerId: params.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { rating: true, comment: true, createdAt: true, buyer: { select: { displayName: true } } },
    }),
    prisma.marketplaceListing.findMany({
      where: { sellerId: params.id, status: "ACTIVE", quantity: { gt: 0 } },
      orderBy: { priceCents: "asc" },
      take: 60,
      include: {
        card: { select: { id: true, name: true, slug: true, setCode: true, collectorNumber: true, imageThumbUrl: true, variant: true, isPromo: true, rarity: true } },
      },
    }),
  ]);

  const shopName = profile.shopName || profile.user.displayName;

  return (
    <div className="mx-auto max-w-4xl">
      {/* The visible trail below has always been here; the machine-readable copy
          was the only template on the site emitting a breadcrumb with no
          BreadcrumbList behind it (scripts/template-seo-check.ts). Gated on the
          launch flag so pre-launch noindex pages stay markup-free. */}
      {MARKETPLACE_PUBLIC && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              breadcrumb([
                { name: "Marketplace", href: "/marketplace" },
                { name: shopName, href: `/marketplace/seller/${params.id}` },
              ]),
            ),
          }}
        />
      )}
      <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
        <Link href="/marketplace" className="hover:text-slate-300">Marketplace</Link>
        <span>/</span>
        <span className="text-slate-300">{shopName}</span>
      </nav>

      {/* Shop header */}
      <div className="card-surface mb-6 p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-display text-2xl font-extrabold text-white">{shopName}</h1>
          {profile.isOfficial && <span className="chip bg-brand-500/15 text-[10px] font-bold text-brand-300">★ OFFICIAL STORE</span>}
          {rating.avg != null ? (
            <span className="text-sm font-semibold text-gold">★ {rating.avg}/5 <span className="font-normal text-slate-500">({rating.count} review{rating.count === 1 ? "" : "s"})</span></span>
          ) : (
            <span className="text-xs text-slate-500">no reviews yet</span>
          )}
        </div>
        {profile.bio && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">{profile.bio}</p>}
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
          <span>📍 Ships within {profile.country}</span>
          <span>
            🚚 {profile.shippingFlatCents > 0 ? `${formatMoney(profile.shippingFlatCents, profile.currency)} flat` : "Free shipping"}
            {profile.freeOverCents > 0 && ` · free over ${formatMoney(profile.freeOverCents, profile.currency)}`}
          </span>
          <span>⏱ Ships in ~{profile.handlingDays} day{profile.handlingDays === 1 ? "" : "s"}</span>
          <span>Member since {new Date(profile.user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</span>
        </div>
        {profile.shippingNote && <p className="mt-2 text-xs italic text-slate-500">{profile.shippingNote}</p>}
      </div>

      {/* Listings */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-extrabold text-white">Cards for sale ({listings.length})</h2>
        {listings.length === 0 ? (
          <p className="card-surface p-8 text-center text-sm text-slate-500">Nothing listed right now.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {listings.map((l) => (
              <li key={l.id}>
                <Link href={`/card/${l.card.slug ?? l.card.id}`} className="card-surface flex h-full flex-col overflow-hidden transition-colors hover:border-brand-500/50">
                  <div className="aspect-[5/7] w-full bg-ink-900">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {l.card.imageThumbUrl ? <img src={l.card.imageThumbUrl} alt={cardImageAlt(l.card)} width={300} height={420} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="p-2.5">
                    <div className="truncate text-xs font-semibold text-white">{cardDisplayName(l.card.name, l.card)}</div>
                    <div className="text-[10px] text-slate-500">{l.condition}{l.isFoil ? " · ✦" : ""} · ×{l.quantity}</div>
                    <div className="text-sm font-extrabold text-accent">{formatMoney(l.priceCents, l.currency)}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Reviews */}
      <section>
        <h2 className="mb-3 text-lg font-extrabold text-white">Reviews</h2>
        {reviews.length === 0 ? (
          <p className="card-surface p-6 text-center text-sm text-slate-500">No reviews yet — be the first to buy and rate.</p>
        ) : (
          <ul className="card-surface divide-y divide-ink-800">
            {reviews.map((r, i) => (
              <li key={i} className="p-4">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-gold">{"★".repeat(r.rating)}<span className="text-ink-700">{"★".repeat(5 - r.rating)}</span></span>
                  <span className="font-medium text-white">{r.buyer.displayName}</span>
                  <span className="text-xs text-slate-600">{new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
                {r.comment && <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
