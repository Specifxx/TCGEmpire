import type { MetadataRoute } from "next";
import { getDecksSection } from "@/lib/sitemap-data";

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return (await getDecksSection()).entries;
}
