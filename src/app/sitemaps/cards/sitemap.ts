import type { MetadataRoute } from "next";
import { getCardsSection } from "@/lib/sitemap-data";

// The bulk of the site's URLs (~1,358 /card/<slug> pages) — split into its own
// sitemap so its indexation rate is visible in Search Console separately from
// every other section.
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return (await getCardsSection()).entries;
}
