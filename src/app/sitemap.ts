import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site";
import { META_DECKS } from "@/lib/meta-decks";
import { getArticles } from "@/lib/articles";
import { SETS } from "@/lib/constants";

// Regenerate at most once per day — the card set is stable.
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Whole-function fence: a sitemap prerender failure hard-fails the entire
  // Vercel build, so ANY error here degrades to static routes instead.
  let cards: { id: string; slug: string | null; lowestPriceCents: number | null }[] = [];
  try {
    cards = await prisma.card.findMany({
      select: { id: true, slug: true, lowestPriceCents: true },
      orderBy: { lowestPriceCents: { sort: "desc", nulls: "last" } },
    });
  } catch (e) {
    console.error("sitemap: card query failed, serving static routes:", e);
  }

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/browse`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/movers`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/market`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/sealed`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/decks`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/deck`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/forum`, changeFrequency: "hourly", priority: 0.7 },
    { url: `${SITE_URL}/trade`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/learn`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/riftle`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/games`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/games/higher-lower`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/games/price-check`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/games/zoomed`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/games/pairs`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/guides`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.7 },
  ];

  const articleRoutes: MetadataRoute.Sitemap = getArticles().map((a) => ({
    url: `${SITE_URL}/${a.category === "guide" ? "guides" : "blog"}/${a.slug}`,
    changeFrequency: "monthly",
    priority: 0.6,
    // Real publish date — articles don't change daily, and an honest signal
    // beats stamping everything "today" (Google learns to distrust the latter).
    lastModified: new Date(`${a.date}T09:00:00+10:00`),
  }));

  // Set landing pages (high-value head terms, e.g. "Riftbound Origins prices").
  const setRoutes: MetadataRoute.Sitemap = SETS.filter((s) => !s.comingSoon).map((s) => ({
    url: `${SITE_URL}/sets/${s.slug}`,
    changeFrequency: "daily",
    priority: 0.85,
  }));

  const deckRoutes: MetadataRoute.Sitemap = META_DECKS.map((d) => ({
    url: `${SITE_URL}/decks/${d.slug}`,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const cardRoutes: MetadataRoute.Sitemap = cards.map((c) => ({
    url: `${SITE_URL}/card/${c.slug ?? c.id}`,
    changeFrequency: "daily",
    // Priced cards (the ones people search for) rank slightly higher.
    priority: c.lowestPriceCents != null ? 0.8 : 0.5,
  }));

  // Stamp every URL with a lastModified so Google has a freshness signal to
  // prioritise crawling (prices/content refresh daily; this sitemap regenerates
  // daily via `revalidate`).
  const now = new Date();
  return [...staticRoutes, ...setRoutes, ...deckRoutes, ...articleRoutes, ...cardRoutes].map((e) => ({
    lastModified: now,
    ...e,
  }));
}
