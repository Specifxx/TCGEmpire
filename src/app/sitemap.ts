import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { dbHistory } from "@/lib/db-history";
import { SITE_URL } from "@/lib/site";
import { META_DECKS } from "@/lib/meta-decks";
import { getArticles } from "@/lib/articles";
import { SETS } from "@/lib/constants";
import { DOMAIN_PAGES } from "@/lib/domains";
import { MARKETPLACE_PUBLIC } from "@/lib/marketplace";
import { KEYWORDS } from "@/lib/keywords";
import { CHAMPIONS, championCardWhere } from "@/lib/champions";
import { TYPE_FACETS, RARITY_FACETS, PRINTING_FACETS } from "@/lib/facets";
import { buildCardWhere } from "@/lib/cards";
import { DEFAULT_COUNTRY } from "@/lib/country";

// Regenerate at most once per day — the card set is stable.
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Whole-function fence: a sitemap prerender failure hard-fails the entire
  // Vercel build, so ANY error here degrades to static routes instead.
  let cards: { id: string; slug: string | null; lowestPriceCents: number | null; imageUrl: string | null }[] = [];
  // Honest lastModified for price-bearing pages: the day of the latest price
  // snapshot (i.e. when the page's content really last changed). Stamping
  // every URL with "now" on every regeneration teaches Google to DISTRUST the
  // sitemap's dates entirely — a classic route into "Crawled - currently not
  // indexed". Evergreen pages (privacy, games, about…) carry no lastModified
  // at all rather than a fake one.
  let priceDay: Date | undefined;
  try {
    cards = await prisma.card.findMany({
      select: { id: true, slug: true, lowestPriceCents: true, imageUrl: true },
      orderBy: { lowestPriceCents: { sort: "desc", nulls: "last" } },
    });
    priceDay = (
      await dbHistory.priceHistory.findFirst({ orderBy: { day: "desc" }, select: { day: true } })
    )?.day;
  } catch (e) {
    console.error("sitemap: card query failed, serving static routes:", e);
  }

  const staticRoutes: MetadataRoute.Sitemap = [
    // Price-bearing pages: their content genuinely changes with each snapshot,
    // so the latest snapshot day is an HONEST lastModified.
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1, lastModified: priceDay },
    { url: `${SITE_URL}/browse`, changeFrequency: "daily", priority: 0.9, lastModified: priceDay },
    { url: `${SITE_URL}/singles`, changeFrequency: "daily", priority: 0.9, lastModified: priceDay },
    { url: `${SITE_URL}/movers`, changeFrequency: "daily", priority: 0.8, lastModified: priceDay },
    { url: `${SITE_URL}/market`, changeFrequency: "daily", priority: 0.8, lastModified: priceDay },
    { url: `${SITE_URL}/sealed`, changeFrequency: "daily", priority: 0.8, lastModified: priceDay },
    { url: `${SITE_URL}/sets`, changeFrequency: "weekly", priority: 0.8, lastModified: priceDay },
    { url: `${SITE_URL}/decks`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/deck`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/bulk-pricer`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/trade`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/learn`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/riftle`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/games`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/tools`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/tools/box-ev`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/tools/best-basket`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/tools/value-finder`, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE_URL}/tools/rising`, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE_URL}/tools/deal-finder`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/stores/tracked`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/stores/suggest`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/premium`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/widgets`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/domains`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/keywords`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/cards`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/champions`, changeFrequency: "daily", priority: 0.8, lastModified: priceDay },
    { url: `${SITE_URL}/stores`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/games/higher-lower`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/games/price-check`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/games/zoomed`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/games/pairs`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/games/pack-sim`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/games/twenty48`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/games/card-smash`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/guides`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/vendetta-countdown`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/feedback`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/contact`, changeFrequency: "yearly", priority: 0.4 },
    // Returns policy — deliberately higher priority than the other legal pages:
    // Merchant Center / Shopping surfaces look for a conventional return policy,
    // so it needs to be crawled and indexed, not treated as boilerplate.
    { url: `${SITE_URL}/returns`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];

  const articleRoutes: MetadataRoute.Sitemap = getArticles().map((a) => ({
    url: `${SITE_URL}/${a.category === "guide" ? "guides" : "blog"}/${a.slug}`,
    changeFrequency: "monthly",
    priority: 0.6,
    // Real publish OR last-substantive-edit date — articles don't change daily,
    // and an honest signal beats stamping everything "today" (Google learns to
    // distrust the latter). `updated` existed on ~30 articles but was never read
    // here, so a genuinely-refreshed guide's sitemap entry looked exactly as
    // stale as one untouched since launch.
    lastModified: new Date(`${a.updated ?? a.date}T09:00:00+10:00`),
  }));

  // Auto-generated market reports are DELIBERATELY NOT in the sitemap, and are
  // noindexed at the page level (see src/app/blog/[slug]/page.tsx).
  //
  // WHY: these were generated daily — one templated post per calendar day,
  // forever, each carrying only ~2-3 sentences of variable prose wrapped around
  // a numeric table — the textbook shape of Google's "scaled content abuse" spam
  // policy, and a real AdSense Publisher-Policy risk. Across a full Search
  // Console export (205 page rows / 1,899 impressions) NOT ONE market-report URL
  // appeared — they earned no search traffic to lose.
  //
  // Generation is now stopped entirely (see lib/market-report.ts) rather than
  // just excluded from the sitemap: the homepage banner and the /market/wrap
  // archive that used to surface them are both removed, and getBlogPosts()
  // (lib/posts.ts) no longer merges them into the public blog list/feeds/news
  // sitemap. Existing report rows stay in the DB and resolve directly by URL
  // (still noindexed) but are no longer linked from anywhere on the site.
  const reportRoutes: MetadataRoute.Sitemap = [];

  // Set landing pages (high-value head terms, e.g. "Riftbound Origins prices").
  // comingSoon sets are included too at lower priority: pre-release query volume
  // ("riftbound vendetta") is real, the page is live/indexable and linked from
  // the blog, and it self-upgrades the day singles land.
  const setRoutes: MetadataRoute.Sitemap = SETS.map((s) => ({
    url: `${SITE_URL}/sets/${s.slug}`,
    changeFrequency: "daily" as const,
    priority: s.comingSoon ? 0.6 : 0.85,
    ...(s.comingSoon ? {} : { lastModified: priceDay }),
  }));

  // Domain landing pages (e.g. "Riftbound Fury cards") — topical hubs that link
  // out to every card in the domain.
  const domainRoutes: MetadataRoute.Sitemap = DOMAIN_PAGES.map((d) => ({
    url: `${SITE_URL}/domains/${d.slug}`,
    changeFrequency: "daily",
    priority: 0.8,
    lastModified: priceDay,
  }));

  // Keyword reference pages — only the ones with verified rules text (see
  // lib/keywords.ts); the rest of the glossary index isn't a separate URL.
  const keywordRoutes: MetadataRoute.Sitemap = KEYWORDS.map((k) => ({
    url: `${SITE_URL}/keywords/${k.slug}`,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  // Facet pages — thin ones (< FACET_THIN_THRESHOLD cards) are noindexed at the
  // page level, but leaving them out of the sitemap too avoids submitting a URL
  // Google will just drop as noindex. That check needs a DB count per facet, so
  // it's done here rather than duplicating it from the page's own metadata.
  const facetDefs = [
    ...TYPE_FACETS.map((f) => ({ f, base: "type" })),
    ...RARITY_FACETS.map((f) => ({ f, base: "rarity" })),
    ...PRINTING_FACETS.map((f) => ({ f, base: "printing" })),
  ];
  let facetRoutes: MetadataRoute.Sitemap = facetDefs.map(({ f, base }) => ({
    url: `${SITE_URL}/cards/${base}/${f.slug}`,
    changeFrequency: "daily" as const,
    priority: 0.6,
    lastModified: priceDay,
  }));
  try {
    const counts = await Promise.all(facetDefs.map(({ f }) => prisma.card.count({ where: buildCardWhere(f.query, DEFAULT_COUNTRY) })));
    facetRoutes = facetDefs
      .filter((_, i) => counts[i] >= 8)
      .map(({ f, base }) => ({
        url: `${SITE_URL}/cards/${base}/${f.slug}`,
        changeFrequency: "daily" as const,
        priority: 0.6,
        lastModified: priceDay,
      }));
  } catch (e) {
    console.error("sitemap: facet count query failed, listing all facet routes:", e);
  }

  // Champion hubs — only those that actually have cards. A champion in the
  // allowlist with no printings yet would be a 404 (the page calls notFound()),
  // and submitting a URL that 404s is worse than omitting it.
  let championRoutes: MetadataRoute.Sitemap = [];
  try {
    const counts = await Promise.all(
      CHAMPIONS.map((c) => prisma.card.count({ where: championCardWhere(c) }))
    );
    championRoutes = CHAMPIONS.filter((_, i) => counts[i] > 0).map((c) => ({
      url: `${SITE_URL}/champions/${c.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
      lastModified: priceDay,
    }));
  } catch (e) {
    console.error("sitemap: champion count query failed, omitting champion routes:", e);
  }

  const deckRoutes: MetadataRoute.Sitemap = META_DECKS.map((d) => ({
    url: `${SITE_URL}/decks/${d.slug}`,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  // Marketplace pages — only once publicly launched (pre-launch they're
  // noindexed, and a sitemap entry pointing at a noindex page is a Search
  // Console warning). Seller storefronts join for every seller with stock.
  let marketplaceRoutes: MetadataRoute.Sitemap = [];
  if (MARKETPLACE_PUBLIC) {
    marketplaceRoutes = [
      { url: `${SITE_URL}/marketplace`, changeFrequency: "daily", priority: 0.8 },
      { url: `${SITE_URL}/marketplace/faq`, changeFrequency: "monthly", priority: 0.5 },
      { url: `${SITE_URL}/marketplace/buyer-protection`, changeFrequency: "monthly", priority: 0.5 },
      { url: `${SITE_URL}/marketplace/shipping`, changeFrequency: "monthly", priority: 0.4 },
      { url: `${SITE_URL}/marketplace/terms`, changeFrequency: "yearly", priority: 0.3 },
    ];
    try {
      const sellers = await prisma.marketplaceListing.findMany({
        where: { status: "ACTIVE", quantity: { gt: 0 } },
        distinct: ["sellerId"],
        select: { sellerId: true },
        take: 1000,
      });
      marketplaceRoutes.push(
        ...sellers.map((s) => ({
          url: `${SITE_URL}/marketplace/seller/${s.sellerId}`,
          changeFrequency: "daily" as const,
          priority: 0.5,
        }))
      );
    } catch (e) {
      console.error("sitemap: seller query failed, static marketplace routes only:", e);
    }
  }

  const cardRoutes: MetadataRoute.Sitemap = cards.map((c) => ({
    url: `${SITE_URL}/card/${c.slug ?? c.id}`,
    changeFrequency: "daily",
    // Priced cards (the ones people search for) rank slightly higher; their
    // prices refresh with every snapshot, so that day is their real lastmod.
    priority: c.lowestPriceCents != null ? 0.8 : 0.5,
    lastModified: c.lowestPriceCents != null ? priceDay : undefined,
    // Image sitemap: surface each card's unique art to image search (absolute URLs only).
    ...(c.imageUrl && c.imageUrl.startsWith("http") ? { images: [c.imageUrl] } : {}),
  }));

  // NOTE: deliberately NO blanket "lastModified: now" — evergreen pages
  // (privacy, games, deck guides…) carry no date rather than a fake one.
  return [...staticRoutes, ...marketplaceRoutes, ...setRoutes, ...domainRoutes, ...keywordRoutes, ...facetRoutes, ...championRoutes, ...deckRoutes, ...articleRoutes, ...reportRoutes, ...cardRoutes];
}
