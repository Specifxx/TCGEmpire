import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { dbHistory } from "@/lib/db-history";
import { SITE_URL } from "@/lib/site";
import { META_DECKS } from "@/lib/meta-decks";
import { getArticles } from "@/lib/articles";
import { getMarketReportSlugs } from "@/lib/posts";
import { SETS } from "@/lib/constants";
import { DOMAIN_PAGES } from "@/lib/domains";

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
    { url: `${SITE_URL}/movers`, changeFrequency: "daily", priority: 0.8, lastModified: priceDay },
    { url: `${SITE_URL}/market`, changeFrequency: "daily", priority: 0.8, lastModified: priceDay },
    { url: `${SITE_URL}/sealed`, changeFrequency: "daily", priority: 0.8, lastModified: priceDay },
    { url: `${SITE_URL}/sets`, changeFrequency: "weekly", priority: 0.8, lastModified: priceDay },
    { url: `${SITE_URL}/decks`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/deck`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/forum`, changeFrequency: "hourly", priority: 0.7 },
    { url: `${SITE_URL}/trade`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/learn`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/riftle`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/games`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/tools`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/tools/box-ev`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/tools/best-basket`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/tools/value-finder`, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE_URL}/tools/arbitrage`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/tools/net-proceeds`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/tools/grade-ev`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/card-value`, changeFrequency: "daily", priority: 0.85, lastModified: priceDay },
    { url: `${SITE_URL}/stores/tracked`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/premium`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/widgets`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/domains`, changeFrequency: "weekly", priority: 0.7 },
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
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/contact`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];

  const articleRoutes: MetadataRoute.Sitemap = getArticles().map((a) => ({
    url: `${SITE_URL}/${a.category === "guide" ? "guides" : "blog"}/${a.slug}`,
    changeFrequency: "monthly",
    priority: 0.6,
    // Real publish date — articles don't change daily, and an honest signal
    // beats stamping everything "today" (Google learns to distrust the latter).
    lastModified: new Date(`${a.date}T09:00:00+10:00`),
  }));

  // Auto-generated daily market reports (DB-backed blog posts).
  const reports = await getMarketReportSlugs();
  const reportRoutes: MetadataRoute.Sitemap = reports.map((r) => ({
    url: `${SITE_URL}/blog/${r.slug}`,
    changeFrequency: "monthly" as const,
    priority: 0.6,
    lastModified: new Date(`${r.day}T09:00:00+10:00`),
  }));

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

  const deckRoutes: MetadataRoute.Sitemap = META_DECKS.map((d) => ({
    url: `${SITE_URL}/decks/${d.slug}`,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

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
  return [...staticRoutes, ...setRoutes, ...domainRoutes, ...deckRoutes, ...articleRoutes, ...reportRoutes, ...cardRoutes];
}
