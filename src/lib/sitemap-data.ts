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
import { STORE_PAGES, STORE_THIN_THRESHOLD } from "@/lib/store-pages";
import { TYPE_FACETS, RARITY_FACETS, PRINTING_FACETS } from "@/lib/facets";
import { buildCardWhere } from "@/lib/cards";
import { DEFAULT_COUNTRY } from "@/lib/country";
import { staticPageDate } from "@/lib/static-page-dates";

// Shared data source for the /sitemap.xml index and its 7 child sitemaps
// (src/app/sitemaps/*/sitemap.ts). Splitting the old single 1,641-URL sitemap by
// section makes per-section indexation visible in Search Console; each function
// below owns exactly the URLs that used to live in one part of the old monolith,
// so the total URL count across sections is unchanged.
//
// Honest lastModified, everywhere: "the day of the latest price snapshot" for any
// page whose content is genuinely price-driven (real, changes about once a day),
// a per-route hand-maintained date for static shells (see static-page-dates.ts),
// and a card's own createdAt as the last resort for a card with no price history
// yet. Never `new Date()` / build time — see sitemap-data.ts callers' comments.

export interface SitemapSection {
  entries: MetadataRoute.Sitemap;
  // Representative date for this section's <sitemap><lastmod> in the index.
  lastModified?: Date;
}

// Single shared "day the price data last refreshed" signal — real and honest
// (Google is not told "now" on every deploy), reused across every price-bearing
// section. Never throws; a DB blip degrades to no lastModified rather than a lie.
export async function getPriceDay(): Promise<Date | undefined> {
  try {
    return (
      await dbHistory.priceHistory.findFirst({ orderBy: { day: "desc" }, select: { day: true } })
    )?.day;
  } catch (e) {
    console.error("sitemap: priceDay query failed:", e);
    return undefined;
  }
}

// ── Core: homepage, database views, tools, legal/info pages ──────────────────
export async function getCoreSection(): Promise<SitemapSection> {
  const priceDay = await getPriceDay();

  const pages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1, lastModified: priceDay },
    { url: `${SITE_URL}/browse`, changeFrequency: "daily", priority: 0.9, lastModified: priceDay },
    { url: `${SITE_URL}/singles`, changeFrequency: "daily", priority: 0.9, lastModified: priceDay },
    { url: `${SITE_URL}/movers`, changeFrequency: "daily", priority: 0.8, lastModified: priceDay },
    { url: `${SITE_URL}/market`, changeFrequency: "daily", priority: 0.8, lastModified: priceDay },
    { url: `${SITE_URL}/sealed`, changeFrequency: "daily", priority: 0.8, lastModified: priceDay },
    { url: `${SITE_URL}/deck`, changeFrequency: "weekly", priority: 0.6, lastModified: staticPageDate("/deck") },
    { url: `${SITE_URL}/bulk-pricer`, changeFrequency: "weekly", priority: 0.6, lastModified: staticPageDate("/bulk-pricer") },
    { url: `${SITE_URL}/trade`, changeFrequency: "monthly", priority: 0.7, lastModified: staticPageDate("/trade") },
    { url: `${SITE_URL}/learn`, changeFrequency: "monthly", priority: 0.8, lastModified: priceDay },
    { url: `${SITE_URL}/riftle`, changeFrequency: "daily", priority: 0.7, lastModified: staticPageDate("/riftle") },
    { url: `${SITE_URL}/games`, changeFrequency: "weekly", priority: 0.7, lastModified: priceDay },
    { url: `${SITE_URL}/tools`, changeFrequency: "weekly", priority: 0.7, lastModified: staticPageDate("/tools") },
    { url: `${SITE_URL}/tools/box-ev`, changeFrequency: "weekly", priority: 0.7, lastModified: priceDay },
    { url: `${SITE_URL}/tools/best-basket`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/tools/best-basket") },
    { url: `${SITE_URL}/tools/value-finder`, changeFrequency: "daily", priority: 0.6, lastModified: priceDay },
    { url: `${SITE_URL}/tools/rising`, changeFrequency: "daily", priority: 0.6, lastModified: priceDay },
    { url: `${SITE_URL}/tools/deal-finder`, changeFrequency: "daily", priority: 0.7, lastModified: priceDay },
    { url: `${SITE_URL}/premium`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/premium") },
    { url: `${SITE_URL}/widgets`, changeFrequency: "monthly", priority: 0.6, lastModified: priceDay },
    { url: `${SITE_URL}/vendetta-countdown`, changeFrequency: "daily", priority: 0.8, lastModified: staticPageDate("/vendetta-countdown") },
    { url: `${SITE_URL}/feedback`, changeFrequency: "monthly", priority: 0.5, lastModified: staticPageDate("/feedback") },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5, lastModified: staticPageDate("/about") },
    { url: `${SITE_URL}/contact`, changeFrequency: "yearly", priority: 0.4, lastModified: staticPageDate("/contact") },
    // Returns policy — deliberately higher priority than the other legal pages:
    // Merchant Center / Shopping surfaces look for a conventional return policy,
    // so it needs to be crawled and indexed, not treated as boilerplate.
    { url: `${SITE_URL}/returns`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/returns") },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3, lastModified: staticPageDate("/privacy") },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3, lastModified: staticPageDate("/terms") },
  ];

  // Mini-games: static shells (live prices are fetched client-side; nothing that
  // varies with the data is server-rendered here).
  const games: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/games/higher-lower`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/games/higher-lower") },
    { url: `${SITE_URL}/games/price-check`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/games/price-check") },
    { url: `${SITE_URL}/games/zoomed`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/games/zoomed") },
    { url: `${SITE_URL}/games/pairs`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/games/pairs") },
    { url: `${SITE_URL}/games/pack-sim`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/games/pack-sim") },
    { url: `${SITE_URL}/games/twenty48`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/games/twenty48") },
    { url: `${SITE_URL}/games/card-smash`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/games/card-smash") },
  ];

  // Marketplace pages — only once publicly launched (pre-launch they're
  // noindexed, and a sitemap entry pointing at a noindex page is a Search
  // Console warning). Seller storefronts join for every seller with stock.
  let marketplace: MetadataRoute.Sitemap = [];
  if (MARKETPLACE_PUBLIC) {
    marketplace = [
      { url: `${SITE_URL}/marketplace`, changeFrequency: "daily", priority: 0.8, lastModified: priceDay },
      { url: `${SITE_URL}/marketplace/faq`, changeFrequency: "monthly", priority: 0.5, lastModified: staticPageDate("/marketplace/faq") },
      { url: `${SITE_URL}/marketplace/buyer-protection`, changeFrequency: "monthly", priority: 0.5, lastModified: staticPageDate("/marketplace/buyer-protection") },
      { url: `${SITE_URL}/marketplace/shipping`, changeFrequency: "monthly", priority: 0.4, lastModified: staticPageDate("/marketplace/shipping") },
      { url: `${SITE_URL}/marketplace/terms`, changeFrequency: "yearly", priority: 0.3, lastModified: staticPageDate("/marketplace/terms") },
    ];
    try {
      const sellers = await prisma.marketplaceListing.findMany({
        where: { status: "ACTIVE", quantity: { gt: 0 } },
        distinct: ["sellerId"],
        select: { sellerId: true },
        take: 1000,
      });
      marketplace = [
        ...marketplace,
        ...sellers.map((s) => ({
          url: `${SITE_URL}/marketplace/seller/${s.sellerId}`,
          changeFrequency: "daily" as const,
          priority: 0.5,
          lastModified: priceDay,
        })),
      ];
    } catch (e) {
      console.error("sitemap: seller query failed, static marketplace routes only:", e);
    }
  }

  return { entries: [...pages, ...games, ...marketplace], lastModified: priceDay };
}

// ── Cards: every /card/<slug> page (the bulk of the site's URLs) ─────────────
export async function getCardsSection(): Promise<SitemapSection> {
  let cards: { id: string; slug: string | null; lowestPriceCents: number | null; imageUrl: string | null; createdAt: Date }[] = [];
  // Whole-function fence: a card-query failure degrades to an empty (but still
  // valid) cards sitemap rather than taking down the other sections too — each
  // section is now its own request, so a DB blip here can't sink /sitemap.xml.
  try {
    cards = await prisma.card.findMany({
      select: { id: true, slug: true, lowestPriceCents: true, imageUrl: true, createdAt: true },
      orderBy: { lowestPriceCents: { sort: "desc", nulls: "last" } },
    });
  } catch (e) {
    console.error("sitemap: card query failed, serving no card routes:", e);
  }
  const priceDay = await getPriceDay();

  const entries: MetadataRoute.Sitemap = cards.map((c) => ({
    url: `${SITE_URL}/card/${c.slug ?? c.id}`,
    changeFrequency: "daily",
    // Priced cards (the ones people search for) rank slightly higher; their
    // prices refresh with every snapshot, so that day is their real lastmod.
    priority: c.lowestPriceCents != null ? 0.8 : 0.5,
    // Unpriced cards have no price history to anchor a date to — their own
    // import date (createdAt) is still a real fact about the record, never a
    // fabricated "now". (Also covers a priceDay lookup failure for priced cards.)
    lastModified: c.lowestPriceCents != null ? priceDay ?? c.createdAt : c.createdAt,
    // Image sitemap: surface each card's unique art to image search (absolute URLs only).
    ...(c.imageUrl && c.imageUrl.startsWith("http") ? { images: [c.imageUrl] } : {}),
  }));

  return { entries, lastModified: priceDay };
}

// ── Champions: the champion hub + every champion's card gallery ──────────────
export async function getChampionsSection(): Promise<SitemapSection> {
  const priceDay = await getPriceDay();
  const hub: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/champions`, changeFrequency: "daily", priority: 0.8, lastModified: priceDay },
  ];

  // Only champions that actually have cards — a champion in the allowlist with no
  // printings yet would be a 404 (the page calls notFound()), and submitting a
  // URL that 404s is worse than omitting it.
  let championPages: MetadataRoute.Sitemap = [];
  try {
    const counts = await Promise.all(CHAMPIONS.map((c) => prisma.card.count({ where: championCardWhere(c) })));
    championPages = CHAMPIONS.filter((_, i) => counts[i] > 0).map((c) => ({
      url: `${SITE_URL}/champions/${c.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
      lastModified: priceDay,
    }));
  } catch (e) {
    console.error("sitemap: champion count query failed, omitting champion routes:", e);
  }

  return { entries: [...hub, ...championPages], lastModified: priceDay };
}

// ── Sets / domains / keywords: topical browse hubs (incl. the /cards facets) ─
export async function getSetsDomainsKeywordsSection(): Promise<SitemapSection> {
  const priceDay = await getPriceDay();

  const hubs: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/sets`, changeFrequency: "weekly", priority: 0.8, lastModified: priceDay },
    { url: `${SITE_URL}/domains`, changeFrequency: "weekly", priority: 0.7, lastModified: priceDay },
    { url: `${SITE_URL}/keywords`, changeFrequency: "weekly", priority: 0.7, lastModified: staticPageDate("/keywords") },
    { url: `${SITE_URL}/cards`, changeFrequency: "weekly", priority: 0.7, lastModified: priceDay },
  ];

  // Set landing pages (high-value head terms, e.g. "Riftbound Origins prices").
  // comingSoon sets are included too (pre-release query volume is real, the page
  // is live/indexable and linked from the blog, and it self-upgrades the day
  // singles land) — all sets share the same priceDay signal now, so a comingSoon
  // set with zero cards yet still gets an honest, non-fabricated date.
  const setRoutes: MetadataRoute.Sitemap = SETS.map((s) => ({
    url: `${SITE_URL}/sets/${s.slug}`,
    changeFrequency: "daily" as const,
    priority: s.comingSoon ? 0.6 : 0.85,
    lastModified: priceDay,
  }));

  const domainRoutes: MetadataRoute.Sitemap = DOMAIN_PAGES.map((d) => ({
    url: `${SITE_URL}/domains/${d.slug}`,
    changeFrequency: "daily",
    priority: 0.8,
    lastModified: priceDay,
  }));

  // Keyword reference pages — the live "every card with this keyword" list makes
  // these price-bearing too.
  const keywordRoutes: MetadataRoute.Sitemap = KEYWORDS.map((k) => ({
    url: `${SITE_URL}/keywords/${k.slug}`,
    changeFrequency: "weekly",
    priority: 0.7,
    lastModified: priceDay,
  }));

  // Facet pages — thin ones (< FACET_THIN_THRESHOLD cards) are noindexed at the
  // page level, but leaving them out of the sitemap too avoids submitting a URL
  // Google will just drop as noindex.
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

  return { entries: [...hubs, ...setRoutes, ...domainRoutes, ...keywordRoutes, ...facetRoutes], lastModified: priceDay };
}

// ── Stores: the retailer directory + every store's own page ──────────────────
export async function getStoresSection(): Promise<SitemapSection> {
  const priceDay = await getPriceDay();
  const hubs: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/stores`, changeFrequency: "monthly", priority: 0.5, lastModified: priceDay },
    { url: `${SITE_URL}/stores/tracked`, changeFrequency: "weekly", priority: 0.6, lastModified: staticPageDate("/stores/tracked") },
    { url: `${SITE_URL}/stores/suggest`, changeFrequency: "monthly", priority: 0.5, lastModified: staticPageDate("/stores/suggest") },
  ];

  // Only stores with real live inventory. Several tracked retailers are
  // deliberately directory-only (no webstore, or a catalogue we can't
  // auto-price); their page exists and is linked, but a page whose only content
  // is "nothing in stock" is thin, is noindexed at the page level, and shouldn't
  // be submitted for crawling.
  let storeRoutes: MetadataRoute.Sitemap = [];
  try {
    const stocked = await prisma.retailerPrice.groupBy({
      by: ["retailer"],
      where: { inStock: true },
      _count: { _all: true },
    });
    const countByKey = new Map(stocked.map((r) => [r.retailer, r._count._all]));
    storeRoutes = STORE_PAGES.filter((s) => (countByKey.get(s.key) ?? 0) >= STORE_THIN_THRESHOLD).map((s) => ({
      url: `${SITE_URL}/stores/${s.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.6,
      lastModified: priceDay,
    }));
  } catch (e) {
    console.error("sitemap: store inventory query failed, omitting store routes:", e);
  }

  return { entries: [...hubs, ...storeRoutes], lastModified: priceDay };
}

// ── Decks: the meta-decks hub + every deck's own cart-priced page ────────────
export async function getDecksSection(): Promise<SitemapSection> {
  const priceDay = await getPriceDay();
  const hub: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/decks`, changeFrequency: "weekly", priority: 0.8, lastModified: priceDay },
  ];
  const deckRoutes: MetadataRoute.Sitemap = META_DECKS.map((d) => ({
    url: `${SITE_URL}/decks/${d.slug}`,
    changeFrequency: "weekly",
    priority: 0.7,
    lastModified: priceDay,
  }));
  return { entries: [...hub, ...deckRoutes], lastModified: priceDay };
}

// Newest article date per category — each hub's (and the editorial section's)
// own lastmod is the newest article in it: real, data-derived, and it moves
// exactly when the hub's visible content does. Shared by getEditorialSection and
// the /sitemap.xml index (which needs the same dates without re-walking articles
// twice per crawl).
export function getEditorialDates(): { guide: Date; blog: Date } {
  const articles = getArticles();
  const dateOf = (a: ReturnType<typeof getArticles>[number]) => new Date(`${a.updated ?? a.date}T09:00:00+10:00`).getTime();
  const guideDates = articles.filter((a) => a.category === "guide").map(dateOf);
  const blogDates = articles.filter((a) => a.category === "blog").map(dateOf);
  return {
    guide: guideDates.length ? new Date(Math.max(...guideDates)) : staticPageDate("/guides"),
    blog: blogDates.length ? new Date(Math.max(...blogDates)) : staticPageDate("/blog"),
  };
}

// ── Editorial: guides + blog hubs and every article ──────────────────────────
export async function getEditorialSection(): Promise<SitemapSection> {
  const articles = getArticles();
  const articleRoutes: MetadataRoute.Sitemap = articles.map((a) => ({
    url: `${SITE_URL}/${a.category === "guide" ? "guides" : "blog"}/${a.slug}`,
    changeFrequency: "monthly",
    priority: 0.6,
    // Real publish OR last-substantive-edit date — an honest signal beats
    // stamping everything "today" (Google learns to distrust the latter).
    lastModified: new Date(`${a.updated ?? a.date}T09:00:00+10:00`),
  }));

  const { guide: latestGuide, blog: latestBlog } = getEditorialDates();
  const hubs: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/guides`, changeFrequency: "weekly", priority: 0.7, lastModified: latestGuide },
    { url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.7, lastModified: latestBlog },
  ];

  const lastModified = new Date(Math.max(latestGuide.getTime(), latestBlog.getTime()));
  return { entries: [...hubs, ...articleRoutes], lastModified };
}
