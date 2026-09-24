// Live <title>/description for the six market homepages. Reads getHomeStats()
// — the same hourly cache every homepage already renders from, so the title
// costs no query of its own — and fails open to the count-free wording.
import type { Metadata } from "next";
import { getHomeStats } from "./home-stats";
import { homeDescription, homeTitle, pageAlternates, pageOpenGraph, regionHomeHreflang, regionHomeMetadata } from "./seo";
import type { Country } from "./country";

async function liveStats() {
  try {
    return await getHomeStats();
  } catch {
    return null;
  }
}

export async function homeMetadata(): Promise<Metadata> {
  const stats = await liveStats();
  const title = homeTitle(stats?.liveStoresAll);
  const description = homeDescription(stats?.totalCards, stats?.liveStoresAll);
  return {
    title: { absolute: title },
    description,
    openGraph: pageOpenGraph({ title, description, url: "/" }),
    alternates: pageAlternates("/", { languages: regionHomeHreflang() }),
  };
}

export async function regionMetadata(region: Exclude<Country, "US">): Promise<Metadata> {
  const stats = await liveStats();
  return regionHomeMetadata(region, {
    cards: stats?.statsByCountry[region]?.priced,
    stores: stats?.liveStoresByCountry?.[region],
  });
}
