// IndexNow — instant indexing pings for search engines that support the protocol
// (Bing, Yandex, Seznam, Naver; DuckDuckGo consumes Bing's index). One POST tells
// them "these URLs changed, recrawl them now" instead of waiting for the crawler
// to rediscover pages on its own schedule. Google does NOT participate (its
// Indexing API is restricted to job postings/livestreams) — for Google the levers
// remain the sitemap + Search Console.
//
// Protocol: https://www.indexnow.org/documentation — the key below is verified by
// the engines fetching ${SITE_URL}/indexnow.txt (see app/indexnow.txt/route.ts),
// which must return it. PUBLIC by design, like the AdSense id: it only
// authorises "please recrawl riftcompare.com URLs", never anything destructive.
import { prisma } from "./db";
import { SITE_URL } from "./site";
import { SETS } from "./constants";

export const INDEXNOW_KEY = process.env.INDEXNOW_KEY || "43ac93dd97a44d4894bedf52d621c57c";

// Ping only from real production: previews/dev would submit URLs the engines
// then crawl against the canonical host at the wrong moment. (Vercel crons only
// run on production anyway — this guards manual/local invocations.)
const isProduction = () => process.env.VERCEL_ENV === "production";

// Submit a batch of site paths (or absolute URLs) to IndexNow. Best-effort and
// bounded: never throws, 8s timeout, protocol cap of 10k URLs per call. Returns
// the number of URLs submitted (0 = skipped or failed) for cron observability.
export async function pingIndexNow(paths: string[]): Promise<number> {
  if (!isProduction() || !paths.length) return 0;
  const urlList = [...new Set(paths)]
    .slice(0, 10_000)
    .map((p) => (p.startsWith("http") ? p : `${SITE_URL}${p}`));
  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: new URL(SITE_URL).host,
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_URL}/indexnow.txt`,
        urlList,
      }),
      signal: AbortSignal.timeout(8000),
    });
    // 200 = submitted, 202 = accepted (key validation pending) — both are wins.
    return res.ok || res.status === 202 ? urlList.length : 0;
  } catch {
    return 0;
  }
}

// After the daily price refresh: every priced page on the site has genuinely new
// content (prices ARE the content), so resubmit the hubs, the set pages and all
// card pages. Card list comes from the DB; failures degrade to just the hubs.
export async function pingAfterPriceRefresh(): Promise<number> {
  const hubs = ["/", "/browse", "/movers", "/sealed", "/tools/box-ev"];
  const sets = SETS.filter((s) => !s.comingSoon).map((s) => `/sets/${s.slug}`);
  const cards = await prisma.card
    .findMany({ select: { id: true, slug: true }, orderBy: { searchCount: "desc" } })
    .then((rows) => rows.map((c) => `/card/${c.slug ?? c.id}`))
    .catch(() => [] as string[]);
  return pingIndexNow([...hubs, ...sets, ...cards]);
}

// After a CARD IMPORT (new set reveals, promo printings, a catalogue sync).
//
// This is the launch-week lever. New cards do NOT arrive via the price importer —
// they arrive via maintenance.yml's cards-sync / vendetta-pipeline tasks, which
// previously pinged nothing and revalidated nothing, so a freshly imported card
// sat out of /sitemaps/cards.xml until the next price refresh happened to purge
// it (up to ~9h, or the full 24h ISR TTL if that revalidate call failed). During
// a set launch that lag is the whole opportunity.
//
// Deliberately scoped to the cards that actually changed plus the hubs that list
// them, rather than resubmitting the entire ~1,400-card catalogue: a targeted
// batch is a stronger freshness signal and doesn't spend the daily quota
// re-asserting pages that didn't change. `slugs` accepts slug-or-id (whatever
// the importer has); duplicates are collapsed by pingIndexNow.
//
// NOTE: IndexNow reaches Bing/Yandex/Seznam/Naver — NOT Google (see the header).
// Google's half of this fix is the sitemap revalidation that runs alongside it.
export function pingAfterCardImport(slugs: string[], setSlugs: string[] = []): Promise<number> {
  if (!slugs.length) return Promise.resolve(0);
  const hubs = ["/", "/browse", "/cards", "/sitemap.xml"];
  return pingIndexNow([
    ...slugs.map((s) => `/card/${s}`),
    ...setSlugs.map((s) => `/sets/${s}`),
    ...hubs,
  ]);
}
