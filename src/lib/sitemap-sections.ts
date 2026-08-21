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
import { deckGroupPath, indexableDeckGroups } from "./deck-groups";
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
import { hasAnyMarketPrice } from "./market-rows";
import { staticPageDate } from "./static-page-dates";
import { AUTHORS } from "./content/authors";
import { REGION_HOME_PATH } from "./seo";

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
  // The programmatic archetype/domain deck landing pages get their own child
  // rather than joining "decks". They are a NEW template with an unproven index
  // rate, and per-template coverage reporting is the entire reason this sitemap
  // is split (see the file header) — folding them into decks would hide whether
  // they index at the rate the individual deck pages do.
  "deck-groups",
  "content",
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

  // Region home pages (/au, /uk, /sg, /ca) — real, region-locked variants
  // of "/" itself (see components/home/RegionHome.tsx). REGION_HOME_PATH also
  // maps US to "/", already listed on the next line, so it's skipped here.
  const regionHomeEntries: SitemapEntry[] = Object.entries(REGION_HOME_PATH)
    .filter(([, path]) => path !== "/")
    .map(([, path]) => ({ url: `${SITE_URL}${path}`, changeFrequency: "daily" as const, priority: 0.9, lastModified: day }));

  return [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1, lastModified: day },
    ...regionHomeEntries,
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
    // Raised from 0.6 to 0.8 alongside promoting it to a header nav item and a
    // homepage section — it is the most defensible, hardest-to-replicate feature
    // on the site (per-store shipping optimisation, not just price lookup) and
    // was previously priority-ranked below tools with far less depth behind them.
    { url: `${SITE_URL}/tools/best-basket`, changeFrequency: "weekly", priority: 0.8, lastModified: staticPageDate("/tools/best-basket") },
    { url: `${SITE_URL}/tools/value-finder`, changeFrequency: "daily", priority: 0.6, lastModified: day },
    { url: `${SITE_URL}/tools/rising`, changeFrequency: "daily", priority: 0.6, lastModified: day },
    { url: `${SITE_URL}/tools/deal-finder`, changeFrequency: "daily", priority: 0.7, lastModified: day },
    { url: `${SITE_URL}/stores/tracked`, changeFrequency: "weekly", priority: 0.6, lastModified: staticPageDate("/stores/tracked") },
    { url: `${SITE_URL}/stores/suggest`, changeFrequency: "monthly", priority: 0.5, lastModified: staticPageDate("/stores/suggest") },
    { url: `${SITE_URL}/premium`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/premium") },
    { url: `${SITE_URL}/domains`, changeFrequency: "weekly", priority: 0.7, lastModified: day },
    { url: `${SITE_URL}/keywords`, changeFrequency: "weekly", priority: 0.7, lastModified: staticPageDate("/keywords") },
    { url: `${SITE_URL}/cards`, changeFrequency: "weekly", priority: 0.7, lastModified: day },
    // Added 2026-08-20 targeting "riftbound cards rarity" / "riftbound card
    // gallery" directly — see each route's own doc comment.
    { url: `${SITE_URL}/cards/rarity`, changeFrequency: "weekly", priority: 0.7, lastModified: day },
    { url: `${SITE_URL}/gallery`, changeFrequency: "daily", priority: 0.8, lastModified: day },
    { url: `${SITE_URL}/champions`, changeFrequency: "daily", priority: 0.8, lastModified: day },
    { url: `${SITE_URL}/stores`, changeFrequency: "monthly", priority: 0.5, lastModified: day },
    { url: `${SITE_URL}/games/higher-lower`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/games/higher-lower") },
    { url: `${SITE_URL}/games/price-check`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/games/price-check") },
    { url: `${SITE_URL}/games/zoomed`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/games/zoomed") },
    { url: `${SITE_URL}/games/pairs`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/games/pairs") },
    // The pack simulator is not a minor mini-game any more: it is the page
    // targeting "riftbound pack opening simulator", it carries the sourced pack
    // structure and pull-rate tables, and the incumbent at #1 (riftcore.app)
    // serves an empty SPA shell that canonicalises to its own homepage. Rated
    // like the other flagship tools rather than like Riftle.
    { url: `${SITE_URL}/games/pack-sim`, changeFrequency: "weekly", priority: 0.8, lastModified: staticPageDate("/games/pack-sim") },
    { url: `${SITE_URL}/games/twenty48`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/games/twenty48") },
    { url: `${SITE_URL}/games/card-smash`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/games/card-smash") },
    { url: `${SITE_URL}/guides`, changeFrequency: "weekly", priority: 0.7, lastModified: latestGuide },
    { url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.7, lastModified: latestBlog },
    // The countdown slot always points at the NEXT unreleased set. /vendetta-countdown
    // was retired here when Vendetta shipped (it now 301s to /sets/vendetta — see
    // next.config.js); a redirecting URL in a sitemap is a soft error in Search
    // Console, so it is removed rather than left behind.
    { url: `${SITE_URL}/radiance-countdown`, changeFrequency: "daily", priority: 0.8, lastModified: staticPageDate("/radiance-countdown") },
    { url: `${SITE_URL}/radiance-preorders`, changeFrequency: "daily", priority: 0.8, lastModified: staticPageDate("/radiance-preorders") },
    // /feedback is NOT submitted: src/app/feedback/page.tsx sets
    // robots: { index: false, follow: true } (AdSense remediation § Phase 7 —
    // /contact already covers the same intent with real content). Submitting a
    // URL that then says noindex is the "Submitted URL marked 'noindex'" error in
    // Search Console: it spends crawl budget to be told to go away, and reads as
    // a site that disagrees with itself. The noindex is right and stays — the
    // sitemap entry is what was wrong. The page keeps `follow`, and the footer
    // still links it, so it remains crawlable and the link graph is untouched.
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5, lastModified: staticPageDate("/about") },
    // Trust pages. /editorial-policy and /authors carry the "who writes this and
    // how are the prices collected" disclosures a reviewer looks for, so they are
    // submitted rather than left to be discovered from the footer.
    { url: `${SITE_URL}/editorial-policy`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/editorial-policy") },
    { url: `${SITE_URL}/methodology`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/methodology") },
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
    // The BASELINE market's column, not the AU one. `lowestPriceCents` is
    // Australia (see schema.prisma) while DEFAULT_COUNTRY is "US" — the market
    // the card page actually renders for a crawler, and the one whose rows gate
    // its Product JSON-LD. Reading the AU column meant the sitemap described a
    // page it wasn't looking at: US coverage is catalogue-wide (TCGplayer is a
    // real US store) where AU coverage is only what local stores stock, so the
    // common "US-priced, no AU listing" card was stamped with createdAt as its
    // lastmod — a date frozen at import, since Card has no @updatedAt — telling
    // Google a page whose prices change daily had not changed in months.
    prisma.card.findMany({
      select: {
        id: true,
        slug: true,
        lowestPriceCents: true,
        lowestPriceCentsUs: true,
        lowestPriceCentsUk: true,
        lowestPriceCentsSg: true,
        lowestPriceCentsCa: true,
        imageUrl: true,
        createdAt: true,
      },
      orderBy: { lowestPriceCentsUs: { sort: "desc", nulls: "last" } },
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
  return rows.filter((c) => !empty.has(c.id) && !dupes.has(c.id)).map((c) => {
    // "Priced" means priced in ANY market we track, not just the baseline one.
    // The card page localises client-side off a single ISR render, so a card with
    // only a UK price still serves a page whose prices moved with today's import
    // — its lastmod is that day, not its import date.
    const priced = hasAnyMarketPrice(c);
    return {
      url: `${SITE_URL}/card/${c.slug ?? c.id}`,
      changeFrequency: "daily" as const,
      // Priced cards (the ones people search for) rank slightly higher; their
      // prices refresh with every snapshot, so that day is their real lastmod.
      priority: priced ? 0.8 : 0.5,
      // Unpriced cards have no price history to anchor a date to — their own
      // import date (createdAt) is still a real fact about the record, never a
      // fabricated "now". (Also covers a priceDay lookup failure for priced cards.)
      lastModified: priced ? day ?? c.createdAt : c.createdAt,
      // Image sitemap: surface each card's unique art to image search (absolute URLs only).
      ...(c.imageUrl && c.imageUrl.startsWith("http") ? { images: [c.imageUrl] } : {}),
    };
  });
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

  // The gallery route noindexes on a DIFFERENT count than the set page —
  // sets/[set]/gallery/page.tsx excludes promos (`isPromo: false`), since a
  // promo-only set has nothing for the gallery specifically to show even if
  // countByCode above (all cards) is non-zero. Gating the gallery URL on the
  // same count as the set page would submit a URL the page itself noindexes —
  // exactly the "submitted but noindexed" contradiction this sitemap split
  // exists to avoid (see file header). Same fail-open contract as countByCode.
  const galleryCountByCode = await prisma.card
    .groupBy({ by: ["setCode"], where: { isPromo: false }, _count: { _all: true } })
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
  return SETS.filter((s) => !countByCode || (countByCode.get(s.code) ?? 0) > 0).flatMap((s) => {
    const galleryIndexable = !galleryCountByCode || (galleryCountByCode.get(s.code) ?? 0) > 0;
    return [
      {
        url: `${SITE_URL}/sets/${s.slug}`,
        changeFrequency: "daily" as const,
        priority: s.comingSoon ? 0.6 : 0.85,
        lastModified: day,
      },
      ...(galleryIndexable
        ? [
            {
              url: `${SITE_URL}/sets/${s.slug}/gallery`,
              changeFrequency: "daily" as const,
              priority: s.comingSoon ? 0.5 : 0.8,
              lastModified: day,
            },
          ]
        : []),
    ];
  });
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

async function deckGroups(): Promise<SitemapEntry[]> {
  const day = decksModified(await priceDay());
  // indexableDeckGroups() is the SAME predicate the pages' robots tag reads
  // (lib/deck-groups.ts), so a group can never be submitted here while telling
  // Google not to index it — the contradiction that fills Search Console's
  // "Submitted URL marked 'noindex'" bucket. Groups below the threshold, and
  // groups with no real deck at all, are simply absent.
  return indexableDeckGroups().map((g) => ({
    url: `${SITE_URL}${deckGroupPath(g)}`,
    changeFrequency: "weekly" as const,
    // Just under an individual deck page: these are the hub, the decklist is the
    // destination.
    priority: 0.65,
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

// ARCHIVED (2026-08-19): the marketplace feature is fully disabled (see
// lib/marketplace.ts) and this builder is no longer registered in BUILDERS/
// SECTIONS below, so /sitemaps/marketplace.xml now 404s (see [section]/route.ts's
// own "unknown section 404s" comment) instead of serving an always-empty
// sitemap. Kept here, still gated on MARKETPLACE_PUBLIC, so re-registering it
// is a one-line change if the feature comes back. Exported (unlike the other
// builders) purely so it counts as used while unregistered.
export async function marketplace(): Promise<SitemapEntry[]> {
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
  core, cards, sets, domains, keywords, facets, champions, stores, decks,
  "deck-groups": deckGroups,
  content,
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
