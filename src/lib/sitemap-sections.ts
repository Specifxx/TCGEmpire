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
import { normalizeSearch } from "./format";
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
    { url: `${SITE_URL}/market/records`, changeFrequency: "daily", priority: 0.7, lastModified: day },
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
    { url: `${SITE_URL}/tools/selling-fees`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/tools/selling-fees") },
    // Raised from 0.6 to 0.8 when it briefly had a header nav item and a
    // homepage section — the homepage section stays (see HomeSections.tsx) even
    // though the header link didn't (Best Basket moved back to Premium — see
    // lib/premium.ts's tier note), and it is still the most defensible,
    // hardest-to-replicate feature on the site (per-store shipping optimisation,
    // not just price lookup), so the priority stays where it landed.
    { url: `${SITE_URL}/tools/best-basket`, changeFrequency: "weekly", priority: 0.8, lastModified: staticPageDate("/tools/best-basket") },
    { url: `${SITE_URL}/tools/value-finder`, changeFrequency: "daily", priority: 0.6, lastModified: day },
    { url: `${SITE_URL}/tools/rising`, changeFrequency: "daily", priority: 0.6, lastModified: day },
    { url: `${SITE_URL}/tools/rising-sealed`, changeFrequency: "daily", priority: 0.5, lastModified: day },
    { url: `${SITE_URL}/tools/demand`, changeFrequency: "daily", priority: 0.6, lastModified: day },
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
    { url: `${SITE_URL}/games/space-invaders`, changeFrequency: "monthly", priority: 0.6, lastModified: staticPageDate("/games/space-invaders") },
    { url: `${SITE_URL}/guides`, changeFrequency: "weekly", priority: 0.7, lastModified: latestGuide },
    { url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.7, lastModified: latestBlog },
    // The release calendar. This slot used to be a per-set countdown URL that had
    // to be swapped here every launch (/vendetta-countdown, then
    // /radiance-countdown — both now 301, see next.config.js), and a redirecting
    // URL left in a sitemap is a soft error in Search Console. /release-dates is
    // set-agnostic, so this line stays put through every future launch.
    { url: `${SITE_URL}/release-dates`, changeFrequency: "daily", priority: 0.8, lastModified: staticPageDate("/release-dates") },
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
    { url: `${SITE_URL}/support`, changeFrequency: "monthly", priority: 0.4, lastModified: staticPageDate("/support") },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3, lastModified: staticPageDate("/privacy") },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3, lastModified: staticPageDate("/terms") },
  ];
}

async function cards(): Promise<SitemapEntry[]> {
  const day = await priceDay();
  const [rows, empty, dupes, maxLastSeenByCard] = await Promise.all([
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
        lowestPriceCentsEu: true,
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
    // PER-CARD freshness — see the note on `lastModified` below for why this
    // replaced the single global `day`. groupBy over the whole RetailerPrice
    // table (not one query per card): 1,400+ cards is exactly the scale where
    // an N+1 query pattern would matter, and this is one query regardless of
    // catalogue size.
    prisma.retailerPrice
      .groupBy({ by: ["cardId"], _max: { lastSeen: true } })
      .then((rows) => new Map(rows.map((r) => [r.cardId, r._max.lastSeen])))
      .catch(() => new Map<string, Date | null>()),
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
      // PER-CARD, not the single global `day` this used to stamp on every priced
      // card alike. An SEO audit found cards.xml's ~1,400 URLs collapsing to only
      // 2 distinct lastmod values total — every currently-priced card sharing
      // the ONE calendar day of the catalogue's most recent price snapshot,
      // regardless of whether THIS card's own listings were actually touched
      // that day. RetailerPrice.lastSeen is the same per-listing freshness
      // timestamp the card page's own "updated Xh ago" text already reads (see
      // CardMarketSection.tsx's timeAgo(p.lastSeen)) — its per-card MAX is a
      // real fact about when this specific card's data last changed, not a
      // catalogue-wide approximation. Falls back to `day` (old behaviour) only
      // if the groupBy above found no row for this card despite it being
      // "priced" (shouldn't happen — hasAnyMarketPrice and RetailerPrice rows
      // come from the same import — but a stale Card.lowestPrice* column
      // outliving its RetailerPrice rows isn't impossible), then to createdAt.
      lastModified: priced ? maxLastSeenByCard.get(c.id) ?? day ?? c.createdAt : c.createdAt,
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

  // PER-SET freshness — same fix as cards()/stores()/champions() above. A set
  // page's content is an aggregate over every card in it, so its honest lastmod
  // is the MOST RECENT listing touch among its OWN cards, not the catalogue-wide
  // `day` every set used to share alike (Vendetta repricing today told Google
  // nothing had changed on Origins, which hasn't seen a real update in months).
  // A raw query, not groupBy: "which set" lives on Card, one join away from
  // RetailerPrice, which groupBy alone can't cross — fully static SQL, no
  // interpolated values, so no escaping concern.
  const lastSeenBySet = await prisma
    .$queryRaw<{ setCode: string; maxLastSeen: Date | null }[]>`
      SELECT c."setCode" AS "setCode", MAX(rp."lastSeen") AS "maxLastSeen"
      FROM "RetailerPrice" rp
      JOIN "Card" c ON c.id = rp."cardId"
      GROUP BY c."setCode"
    `
    .then((rows) => new Map(rows.map((r) => [r.setCode, r.maxLastSeen])))
    .catch(() => new Map<string, Date | null>());

  // comingSoon sets that DO have cards are included at lower priority: pre-release
  // query volume ("riftbound vendetta") is real, the page is live/indexable and
  // linked from the blog, and it self-upgrades the day singles land. A
  // comingSoon set with no listings yet still gets an honest, non-fabricated
  // date (the shared `day` fallback) rather than none at all.
  // Each set contributes TWO URLs: the price-first set page and its visual card
  // gallery (/sets/<slug>/gallery). They target different intents — "vendetta
  // prices" vs "vendetta card gallery" — so both belong in the index. The gallery
  // sits just under its set page: it is a genuine landing page for the browse
  // queries, but the set page is still the commercial destination.
  return SETS.filter((s) => !countByCode || (countByCode.get(s.code) ?? 0) > 0).flatMap((s) => {
    const galleryIndexable = !galleryCountByCode || (galleryCountByCode.get(s.code) ?? 0) > 0;
    const setLastModified = lastSeenBySet.get(s.code) ?? day;
    return [
      {
        url: `${SITE_URL}/sets/${s.slug}`,
        changeFrequency: "daily" as const,
        priority: s.comingSoon ? 0.6 : 0.85,
        lastModified: setLastModified,
      },
      ...(galleryIndexable
        ? [
            {
              url: `${SITE_URL}/sets/${s.slug}/gallery`,
              changeFrequency: "daily" as const,
              priority: s.comingSoon ? 0.5 : 0.8,
              lastModified: setLastModified,
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
  // PER-CHAMPION freshness — same fix as cards()/stores() above, applied here
  // via a relation filter (RetailerPrice → Card) rather than a groupBy, since
  // "which champion" isn't a plain column to group by. One aggregate query per
  // champion, matching the `counts` query above's own shape (CHAMPIONS is a
  // few dozen entries, not the ~1,400-card scale a groupBy exists to spare).
  const lastSeens = await Promise.all(
    CHAMPIONS.map((c) =>
      prisma.retailerPrice
        .aggregate({ where: { card: championCardWhere(c) }, _max: { lastSeen: true } })
        .then((r) => r._max.lastSeen)
        .catch(() => null)
    )
  );
  // Hubs under the threshold carry robots: noindex (see app/champions/[slug]),
  // so submitting them here would ask Google to index URLs we're telling it not
  // to — the contradiction that fills the "Excluded by noindex tag" bucket.
  // Index into `counts`/`lastSeens` BEFORE filtering — filtering first (as the
  // facets() function above does) would silently shift the two arrays out of
  // sync with the filtered CHAMPIONS list.
  return CHAMPIONS.map((c, i) => ({ c, count: counts[i], lastSeen: lastSeens[i] }))
    .filter(({ count }) => count >= CHAMPION_THIN_THRESHOLD)
    .map(({ c, lastSeen }) => ({
      url: `${SITE_URL}/champions/${c.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
      lastModified: lastSeen ?? day,
    }));
}

async function stores(): Promise<SitemapEntry[]> {
  const day = await priceDay();
  // Only stores with real live inventory. Several tracked retailers are
  // deliberately directory-only; their page exists and is linked, but a page
  // whose only content is "nothing in stock" is thin and noindexed.
  //
  // _max: { lastSeen: true } added alongside the existing _count — free on the
  // same groupBy, and PER-STORE freshness (see cards()'s own note on the same
  // fix): a store whose listings haven't actually been touched in days must not
  // share the same lastmod as one that was just re-scraped, which is what the
  // old blanket `day` stamp did for every store page alike.
  const stocked = await prisma.retailerPrice.groupBy({
    by: ["retailer"],
    where: { inStock: true },
    _count: { _all: true },
    _max: { lastSeen: true },
  });
  const byKey = new Map(stocked.map((r) => [r.retailer, r._count._all]));
  const lastSeenByKey = new Map(stocked.map((r) => [r.retailer, r._max.lastSeen]));
  return STORE_PAGES.filter((s) => (byKey.get(s.key) ?? 0) >= STORE_THIN_THRESHOLD).map((s) => ({
    url: `${SITE_URL}/stores/${s.slug}`,
    changeFrequency: "daily" as const,
    priority: 0.6,
    lastModified: lastSeenByKey.get(s.key) ?? day,
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
  const day = await priceDay();
  // PER-DECK freshness — same fix as cards()/sets()/champions()/stores() above,
  // combined with decksModified()'s existing "or the tier list itself moved"
  // rule rather than replacing it: a deck page's honest lastmod is still the
  // LATER of (its own cards' prices, the metagame re-cut date), just computed
  // per deck instead of every one of the ~10 decks sharing the whole
  // catalogue's single most-recent price day.
  //
  // Only ~10 decks (prisma/meta-decks.json), so resolving each one's card names
  // to real Card rows and querying its own price freshness is one query per
  // deck (matching champions()'s own per-item query count) rather than needing
  // a batched groupBy the way cards() does at 1,400+ rows.
  const allNames = [...new Set(META_DECKS.flatMap((d) => [d.legend, ...d.cards.map((c) => c.name)]))];
  const cardIdsByName = await prisma.card
    .findMany({ where: { nameNormalized: { in: allNames.map(normalizeSearch) } }, select: { id: true, nameNormalized: true } })
    .then((rows) => {
      const map = new Map<string, string[]>();
      for (const r of rows) map.set(r.nameNormalized, [...(map.get(r.nameNormalized) ?? []), r.id]);
      return map;
    })
    .catch(() => new Map<string, string[]>());
  const lastSeenByDeck = await Promise.all(
    META_DECKS.map((d) => {
      const ids = [d.legend, ...d.cards.map((c) => c.name)].flatMap((n) => cardIdsByName.get(normalizeSearch(n)) ?? []);
      if (ids.length === 0) return Promise.resolve(null);
      return prisma.retailerPrice
        .aggregate({ where: { cardId: { in: ids } }, _max: { lastSeen: true } })
        .then((r) => r._max.lastSeen)
        .catch(() => null);
    })
  );
  return META_DECKS.map((d, i) => ({
    url: `${SITE_URL}/decks/${d.slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.7,
    lastModified: decksModified(lastSeenByDeck[i] ?? day),
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
  // had earned any traffic to lose. Generation is now DELETED outright, so this
  // list can never regrow — and the read-side was removed with the Index too, so
  // the ~130 legacy rows are no longer served at all (their URLs 404). The rows
  // themselves are left dormant in the database.
  return getArticles().map((a) => ({
    url: `${SITE_URL}/${a.category === "guide" ? "guides" : "blog"}/${a.slug}`,
    changeFrequency: "monthly" as const,
    priority: 0.6,
    lastModified: new Date(`${a.updated ?? a.date}T09:00:00+10:00`),
  }));
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
