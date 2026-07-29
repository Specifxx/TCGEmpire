import type { MetadataRoute } from "next";
import { getStoresSection } from "@/lib/sitemap-data";

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return (await getStoresSection()).entries;
}
