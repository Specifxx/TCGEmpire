import type { MetadataRoute } from "next";
import { getCoreSection } from "@/lib/sitemap-data";

// Regenerate at most once per day — mirrors the old monolithic sitemap's cadence.
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return (await getCoreSection()).entries;
}
