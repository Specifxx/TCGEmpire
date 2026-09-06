/**
 * Ping IndexNow for every published blog/guide article on every production
 * (and preview) deploy — not just once a day.
 *
 * Before this, IndexNow was only submitted on a fixed clock: the daily price-
 * refresh cron (lib/indexnow.ts pingAfterPriceRefresh, hub/set/card pages
 * only — no blog or guide URLs at all) and a separate once-daily GitHub
 * Actions workflow (.github/workflows/indexnow-submit.yml, 06:10 UTC,
 * resubmits the whole sitemap). A brand-new post published in a deploy
 * therefore sat unsubmitted for up to ~24h regardless of how soon it actually
 * went live — real content changes were always waiting on the next scheduled
 * batch rather than triggering a submission themselves. This script closes
 * that gap: every deploy that ships new or edited editorial content pings
 * IndexNow for it immediately, the moment the URLs are actually live.
 *
 * Scoped to blog/guide URLs plus the hubs that list them, not the whole
 * sitemap (that's what the daily workflow is for) — a deploy-triggered ping
 * should be about what THIS deploy might have changed, not re-assert the
 * entire ~1,400-card catalogue on every commit.
 *
 * Best-effort and silent on failure, matching every other script
 * build-db-push.sh runs: never blocks the build, never throws.
 */
import { getArticles } from "../src/lib/articles";
import { pingIndexNow } from "../src/lib/indexnow";

async function main() {
  const articles = getArticles(); // published only — draft/noindex articles are excluded by design
  const urls = [
    "/",
    "/blog",
    "/guides",
    ...articles.map((a) => `/${a.category === "guide" ? "guides" : "blog"}/${a.slug}`),
  ];
  const submitted = await pingIndexNow(urls);
  console.log(`[indexnow-ping-deploy] submitted ${submitted} URL(s) (0 = skipped: not production, or the request failed).`);
}

main().catch((e) => {
  console.warn("[indexnow-ping-deploy] best-effort ping failed, deploy continues:", (e as Error).message);
});
