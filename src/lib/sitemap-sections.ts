// Sitemap data, split into independently-fetchable sections.
//
// WHY SPLIT: this was one ~1,500-URL file. That's well inside Google's 50,000-URL
// limit, so the split is not about size — it's about DIAGNOSIS. Search Console
// reports index coverage PER SUBMITTED SITEMAP, so a single file can only ever
// tell you "N of 1,500 indexed". With sections you can see that (say) card pages
// index at 95% while facet pages index at 10%, which is the difference between
// knowing you have a problem and knowing where it is. That matters here
// specifically because of a 237-URL "crawled – currently not indexed" backlog.
//
// Each section is built on demand by its own route (/sitemaps/<id>.xml), so a
// request for one section never runs the other sections' queries.
import { prisma } from "./db";
import { dbHistory } from "./db-history";
import { SITE_URL } from "./site";
import { META_DECKS, META_UPDATED } from "./meta-decks";
import { getArticles } from "./articles";
import { SETS } from "./constants";
import { DOMAIN_PAGES } from "./domains";
import { MARKETPLACE_PUBLIC } from "./marketplace";
import { KEYWORDS } from "./keywords";
import { CHAMPIONS, championCardWhere, CHAMPION_THIN_THRESHOLD } from "./champions";
import { TYPE_FACETS, RARITY_FACETS, PRINTING_FACETS, FACET_THIN_THRESHOLD } from "./facets";
import { STORE_PAGES, STORE_THIN_THRESHOLD } from "./store-pages";
import { buildCardWhere } from "./cards";
import { getEmptyCardIds } from "./card-price-state";
import { getDuplicateCardIds } from "./card-duplicates";
import { DEFAULT_COUNTRY } from "./country";
import { staticPageDate } from "./static-page-dates";
import { AUTHORS } from "./content/authors";

export interface SitemapEntry {
  url: string;
  lastModified?: Date;
  changeFrequency?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
  images?: string[];
}

export const SECTIONS = [
  "core",
  "cards",
  "sets",
  "domains",
  "keywords",
  "facets",
  "champions",
  "stores",
  "decks",
  "content",
  "marketplace",
] as const;
export type SectionId = (typeof SECTIONS)[number];

// Honest lastModified for price-bearing pages: the day of the latest price
// snapshot (i.e. when the page's content really last changed). Stamping every URL
// with "now" on every regeneration teaches Google to DISTRUST the sitemap's dates
// entirely — a classic route into "Crawled – currently not indexed". Evergreen
// pages that carry no price/DB data of their own (privacy, games, about…) get a
// hand-maintained date instead (see static-page-dates.ts) — every URL needs a
// real lastmod, but "real" means "true fact about the page", never `new Date()`.
async function priceDay(): Promise<Date | undefined> {
  try {
    return (await dbHistory.priceHistory.findFirst({ orderBy: { day: "desc" }, select: { day: true } }))?.day;
  } catch {
    return undefined;
  }
}

async function core(): Promise<SitemapEntry[]> {
  const day = await priceDay();
  // /guides and /blog are hubs whose own visible content is "whatever articles
  // exist" — their honest lastmod is the newest article in each category, not a
  // fabricated date and not the unrelated price-snapshot day.
  const articles = getArticles();
  const dateOf = (a: ReturnType<typeof getArticles>[number]) => new Date(`${a.updated ?? a.date}T09:00:00+10:00`).getTime();
  const guideDates = articles.filter((a) => a.category === "guide").map(dateOf);
  const blogDates = articles.filter((a) => a.category === "blog").map(dateOf);
  const latestGuide = guideDates.length ? new Date(Math.max(...guideDates)) : staticPageDate("/guides");
  const latestBlog = blogDates.length ? new Date(Math.max(...blogDates)) : staticPageDate("/blog");

  return [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1, lastModified: day },
    { url: `${SITE_URL}/browse`, changeFrequency: "daily", priority: 0.9, lastModified: day },
    { url: `${SITE_URL}/singles`, changeFrequency: "daily", priority: 0.9, lastModified: day },
    { url: `${SITE_URL}/movers`, changeFrequency: "daily", priority: 0.8, lastModified: day },
    { url: `${SITE_URL}/market`, changeFrequency: "daily", priority: 0.8, lastModified: day },
    { url: `${SITE_URL}/sealed`, changeFrequency: "daily", priority: 0.8, lastModified: day },
    { url: `${SITE_URL}/sets`, changeFrequency: "weekly", priority: 0.8, lastModified: day },
    { url: `${SITE_URL}/decks`, changeFrequency: "weekly", priority: 0.8, lastModified: decksModified(day) },
    { url: `${SITE_URL}/deck`, changeFrequency: "weekly", priority: 0.6, lastModified: staticPageDate("/deck") },
    { url: `${SITE_URL}/bulk-pricer`, changeFrequency: "weekly", priority: 0.6, lastModified: staticPageDate("/bulk-pricer") },
    { url: `${SITE_URL}/trade`, changeFrequency: "monthly", priority: 0.7, lastModified: staticPageDate("/trade") },
    { url: `${SITE_URL}/learn`, changeFrequency: "monthly", priority: 0.8, lastModified: day },
    { url: `${SITE_URL}/riftle`, changeFrequency: "daily", priority: 0.7, lastModified: staticPageDate("/riftle") },
    { url: `${SITE_URL}/games`, changeFrequency: "weekly", priority: 0.7, lastModified: day },
    { url: `${SITE_URL}/tools`, changeFrequency: "weekly", priority: 0.7, lastModified: staticPageDate("/tools") },
    { url: `${SITE_URL}/tools/box-ev`, changeFrequency: "weekly", priority: 0.7, lastModified: day },
    { url: `${SITE_URL}/tools/best-basket`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/tools/best-basket") },
    { url: `${SITE_URL}/tools/value-finder`, changeFrequency: "daily", priority: 0.6, lastModified: day },
    { url: `${SITE_URL}/tools/rising`, changeFrequency: "daily", priority: 0.6, lastModified: day },
    { url: `${SITE_URL}/tools/deal-finder`, changeFrequency: "daily", priority: 0.7, lastModified: day },
    { url: `${SITE_URL}/stores/tracked`, changeFrequency: "weekly", priority: 0.6, lastModified: staticPageDate("/stores/tracked") },
    { url: `${SITE_URL}/stores/suggest`, changeFrequency: "monthly", priority: 0.5, lastModified: staticPageDate("/stores/suggest") },
    { url: `${SITE_URL}/premium`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/premium") },
    { url: `${SITE_URL}/domains`, changeFrequency: "weekly", priority: 0.7, lastModified: day },
    { url: `${SITE_URL}/keywords`, changeFrequency: "weekly", priority: 0.7, lastModified: staticPageDate("/keywords") },
    { url: `${SITE_URL}/cards`, changeFrequency: "weekly", priority: 0.7, lastModified: day },
    { url: `${SITE_URL}/champions`, changeFrequency: "daily", priority: 0.8, lastModified: day },
    { url: `${SITE_URL}/stores`, changeFrequency: "monthly", priority: 0.5, lastModified: day },
    { url: `${SITE_URL}/games/higher-lower`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/games/higher-lower") },
    { url: `${SITE_URL}/games/price-check`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/games/price-check") },
    { url: `${SITE_URL}/games/zoomed`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/games/zoomed") },
    { url: `${SITE_URL}/games/pairs`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/games/pairs") },
    { url: `${SITE_URL}/games/pack-sim`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/games/pack-sim") },
    { url: `${SITE_URL}/games/twenty48`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/games/twenty48") },
    { url: `${SITE_URL}/games/card-smash`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/games/card-smash") },
    { url: `${SITE_URL}/guides`, changeFrequency: "weekly", priority: 0.7, lastModified: latestGuide },
    { url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.7, lastModified: latestBlog },
    // The countdown slot always points at the NEXT unreleased set. /vendetta-countdown
    // was retired here when Vendetta shipped (it now 301s to /sets/vendetta — see
    // next.config.js); a redirecting URL in a sitemap is a soft error in Search
    // Console, so it is removed rather than left behind.
    { url: `${SITE_URL}/radiance-countdown`, changeFrequency: "daily", priority: 0.8, lastModified: staticPageDate("/radiance-countdown") },
    { url: `${SITE_URL}/feedback`, changeFrequency: "monthly", priority: 0.5, lastModified: staticPageDate("/feedback") },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5, lastModified: staticPageDate("/about") },
    // Trust pages. /editorial-policy and /authors carry the "who writes this and
    // how are the prices collected" disclosures a reviewer looks for, so they are
    // submitted rather than left to be discovered from the footer.
    { url: `${SITE_URL}/editorial-policy`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/editorial-policy") },
    { url: `${SITE_URL}/authors`, changeFrequency: "monthly", priority: 0.5, lastModified: staticPageDate("/authors") },
    ...AUTHORS.map((a) => ({
      url: `${SITE_URL}/authors/${a.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.4,
      lastModified: latestBlog,
    })),
    { url: `${SITE_URL}/contact`, changeFrequency: "yearly", priority: 0.4, lastModified: staticPageDate("/contact") },
    // Returns policy — deliberately higher priority than the other legal pages:
    // Merchant Center / Shopping surfaces look for a conventional return policy,
    // so it needs to be crawled and indexed, not treated as boilerplate.
    { url: `${SITE_URL}/returns`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/returns") },
    { url: `${SITE_URL}/support`, changeFrequency: "monthly", priority: 0.4, lastModified: staticPageDate("/support") },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3, lastModified: staticPageDate("/privacy") },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3, lastModified: staticPageDate("/terms") },
  ];
}

async function cards(): Promise<SitemapEntry[]> {
  const day = await priceDay();
  const [rows, empty, dupes] = await Promise.all([
    prisma.card.findMany({
      select: { id: true, slug: true, lowestPriceCents: true, imageUrl: true, createdAt: true },
      orderBy: { lowestPriceCents: { sort: "desc", nulls: "last" } },
    }),
    // Cards with no in-stock listing anywhere AND under a week of price history
    // carry `robots: noindex` (see app/card/[id]/page.tsx), so listing them here
    // would submit URLs we're simultaneously telling Google not to index — the
    // exact contradiction that fills Search Console's "Excluded by noindex tag"
    // bucket and devalues the sitemap's other 950-odd entries.
    //
    // Not a hand-maintained list: the same query drives the page's own robots
    // tag, so a card re-enters this sitemap automatically on the next
    // regeneration once it gains a listing or a week of history.
    getEmptyCardIds(),
    // Same contradiction, different cause: duplicate rows for one printing point
    // their canonical at the original and carry noindex, so only the canonical
    // URL belongs here. Also self-healing — merge the rows and they come back.
    getDuplicateCardIds(),
  ]);
  return rows.filter((c) => !empty.has(c.id) && !dupes.has(c.id)).map((c) => ({
    url: `${SITE_URL}/card/${c.slug ?? c.id}`,
    changeFrequency: "daily" as const,
    // Priced cards (the ones people search for) rank slightly higher; their
    // prices refresh with every snapshot, so that day is their real lastmod.
    priority: c.lowestPriceCents != null ? 0.8 : 0.5,
    // Unpriced cards have no price history to anchor a date to — their own
    // import date (createdAt) is still a real fact about the record, never a
    // fabricated "now". (Also covers a priceDay lookup failure for priced cards.)
    lastModified: c.lowestPriceCents != null ? day ?? c.createdAt : c.createdAt,
    // Image sitemap: surface each card's unique art to image search (absolute URLs only).
    ...(c.imageUrl && c.imageUrl.startsWith("http") ? { images: [c.imageUrl] } : {}),
  }));
}

async function sets(): Promise<SitemapEntry[]> {
  const day = await priceDay();

  // A set with NOTHING imported is excluded entirely. Both the set page
  // (app/sets/[set]/page.tsx — `cardCount === 0` → robots.index false) and its
  // gallery noindex themselves while empty, so submitting them here would be
  // asking Google to index a page that tells it not to: "Submitted URL marked
  // 'noindex'" in Search Console, twice per announced set.
  //
  // This became reachable the moment an announced-but-unshipped set (Radiance)
  // was added to SETS — Vendetta already had revealed cards by the time it
  // landed here, so the case never arose. The entries reappear on their own the
  // day the official gallery imports, which is also the day the pages start
  // indexing; no code change, and no hand-maintained list to forget.
  // FAILS OPEN. If the count query errors, `countByCode` is null and every set is
  // submitted, exactly as before this filter existed — a transient DB blip must
  // not silently drop every set URL out of the sitemap, which is a far worse
  // outcome than two noindex warnings.
  const countByCode = await prisma.card
    .groupBy({ by: ["setCode"], _count: { _all: true } })
    .then((rows) => new Map(rows.map((c) => [c.setCode, c._count._all])))
    .catch(() => null);

  // comingSoon sets that DO have cards are included at lower priority: pre-release
  // query volume ("riftbound vendetta") is real, the page is live/indexable and
  // linked from the blog, and it self-upgrades the day singles land. All sets
  // share the same priceDay signal — a comingSoon set still gets an honest,
  // non-fabricated date rather than none at all.
  // Each set contributes TWO URLs: the price-first set page and its visual card
  // gallery (/sets/<slug>/gallery). They target different intents — "vendetta
  // prices" vs "vendetta card gallery" — so both belong in the index. The gallery
  // sits just under its set page: it is a genuine landing page for the browse
  // queries, but the set page is still the commercial destination.
  return SETS.filter((s) => !countByCode || (countByCode.get(s.code) ?? 0) > 0).flatMap((s) => [
    {
      url: `${SITE_URL}/sets/${s.slug}`,
      changeFrequency: "daily" as const,
      priority: s.comingSoon ? 0.6 : 0.85,
      lastModified: day,
    },
    {
      url: `${SITE_URL}/sets/${s.slug}/gallery`,
      changeFrequency: "daily" as const,
      priority: s.comingSoon ? 0.5 : 0.8,
      lastModified: day,
    },
  ]);
}

async function domains(): Promise<SitemapEntry[]> {
  const day = await priceDay();
  return DOMAIN_PAGES.map((d) => ({
    url: `${SITE_URL}/domains/${d.slug}`,
    changeFrequency: "daily" as const,
    priority: 0.8,
    lastModified: day,
  }));
}

async function keywords(): Promise<SitemapEntry[]> {
  const day = await priceDay();
  // Only keywords with verified rules text (see lib/keywords.ts); the rest of the
  // glossary index isn't a separate URL. Each page carries a live "every card
  // with this keyword" list, so it's price-bearing like the other card hubs.
  return KEYWORDS.map((k) => ({
    url: `${SITE_URL}/keywords/${k.slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.7,
    lastModified: day,
  }));
}

async function facets(): Promise<SitemapEntry[]> {
  const day = await priceDay();
  const defs = [
    ...TYPE_FACETS.map((f) => ({ f, base: "type" })),
    ...RARITY_FACETS.map((f) => ({ f, base: "rarity" })),
    ...PRINTING_FACETS.map((f) => ({ f, base: "printing" })),
  ];
  const entry = ({ f, base }: (typeof defs)[number]): SitemapEntry => ({
    url: `${SITE_URL}/cards/${base}/${f.slug}`,
    changeFrequency: "daily",
    priority: 0.6,
    lastModified: day,
  });
  try {
    const counts = await Promise.all(
      defs.map(({ f }) => prisma.card.count({ where: buildCardWhere(f.query, DEFAULT_COUNTRY) }))
    );
    // Thin facets are noindexed at the page level; submitting a URL Google will
    // just drop as noindex wastes crawl budget.
    return defs.filter((_, i) => counts[i] >= FACET_THIN_THRESHOLD).map(entry);
  } catch (e) {
    console.error("sitemap/facets: count query failed, listing all facets:", e);
    return defs.map(entry);
  }
}

async function champions(): Promise<SitemapEntry[]> {
  const day = await priceDay();
  // Only champions that actually have cards — the hub page calls notFound() for
  // an empty one, and submitting a URL that 404s is worse than omitting it.
  const counts = await Promise.all(CHAMPIONS.map((c) => prisma.card.count({ where: championCardWhere(c) })));
  // Hubs under the threshold carry robots: noindex (see app/champions/[slug]),
  // so submitting them here would ask Google to index URLs we're telling it not
  // to — the contradiction that fills the "Excluded by noindex tag" bucket.
  return CHAMPIONS.filter((_, i) => counts[i] >= CHAMPION_THIN_THRESHOLD).map((c) => ({
    url: `${SITE_URL}/champions/${c.slug}`,
    changeFrequency: "daily" as const,
    priority: 0.8,
    lastModified: day,
  }));
}

async function stores(): Promise<SitemapEntry[]> {
  const day = await priceDay();
  // Only stores with real live inventory. Several tracked retailers are
  // deliberately directory-only; their page exists and is linked, but a page
  // whose only content is "nothing in stock" is thin and noindexed.
  const stocked = await prisma.retailerPrice.groupBy({
    by: ["retailer"],
    where: { inStock: true },
    _count: { _all: true },
  });
  const byKey = new Map(stocked.map((r) => [r.retailer, r._count._all]));
  return STORE_PAGES.filter((s) => (byKey.get(s.key) ?? 0) >= STORE_THIN_THRESHOLD).map((s) => ({
    url: `${SITE_URL}/stores/${s.slug}`,
    changeFrequency: "daily" as const,
    priority: 0.6,
    lastModified: day,
  }));
}

// A deck page changes when EITHER its prices refresh or the metagame list itself
// is re-cut, so its honest lastmod is whichever happened later. Using priceDay
// alone under-reported a day the tier list moved but prices didn't; using the meta
// date alone under-reports the daily repricing. This is the same stamp the page
// renders as dateModified, so the sitemap and the markup can't drift apart.
function decksModified(day: Date | undefined): Date | undefined {
  const meta = META_UPDATED ? new Date(`${META_UPDATED}T00:00:00Z`) : undefined;
  if (meta && Number.isNaN(meta.getTime())) return day;
  if (!day) return meta;
  if (!meta) return day;
  return meta > day ? meta : day;
}

async function decks(): Promise<SitemapEntry[]> {
  const day = decksModified(await priceDay());
  return META_DECKS.map((d) => ({
    url: `${SITE_URL}/decks/${d.slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.7,
    lastModified: day,
  }));
}

async function content(): Promise<SitemapEntry[]> {
  // Real publish OR last-substantive-edit date. `updated` exists on ~30 articles;
  // reading it means a genuinely-refreshed guide no longer looks as stale as one
  // untouched since launch.
  //
  // Legacy auto-generated market reports are DELIBERATELY absent here and
  // noindexed at the page level: one templated post per calendar day is the
  // textbook shape of Google's "scaled content abuse" policy and an AdSense
  // Publisher-Policy risk. Across a full Search Console export not one report URL
  // had earned any traffic to lose. Generation is now DELETED outright
  // (lib/market-report.ts), so this list can never regrow — the ~130 existing rows
  // stay reachable by direct URL only.
  return getArticles().map((a) => ({
    url: `${SITE_URL}/${a.category === "guide" ? "guides" : "blog"}/${a.slug}`,
    changeFrequency: "monthly" as const,
    priority: 0.6,
    lastModified: new Date(`${a.updated ?? a.date}T09:00:00+10:00`),
  }));
}

async function marketplace(): Promise<SitemapEntry[]> {
  // Only once publicly launched — pre-launch these are noindexed, and a sitemap
  // entry pointing at a noindex page is a Search Console warning.
  if (!MARKETPLACE_PUBLIC) return [];
  const day = await priceDay();
  const base: SitemapEntry[] = [
    { url: `${SITE_URL}/marketplace`, changeFrequency: "daily", priority: 0.8, lastModified: day },
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
    base.push(
      ...sellers.map((s) => ({
        url: `${SITE_URL}/marketplace/seller/${s.sellerId}`,
        changeFrequency: "daily" as const,
        priority: 0.5,
        lastModified: day,
      }))
    );
  } catch (e) {
    console.error("sitemap/marketplace: seller query failed, static routes only:", e);
  }
  return base;
}

const BUILDERS: Record<SectionId, () => Promise<SitemapEntry[]>> = {
  core, cards, sets, domains, keywords, facets, champions, stores, decks, content, marketplace,
};

/**
 * Build one section. Per-section fence: a failure returns [] rather than
 * propagating, because an empty child sitemap degrades one section's discovery
 * whereas a thrown error takes down the whole route.
 */
export async function buildSection(id: SectionId): Promise<SitemapEntry[]> {
  try {
    return await BUILDERS[id]();
  } catch (e) {
    console.error(`sitemap/${id}: build failed, serving an empty section:`, e);
    return [];
  }
}

export const sectionUrl = (id: SectionId): string => `${SITE_URL}/sitemaps/${id}.xml`;
