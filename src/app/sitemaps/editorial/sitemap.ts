import type { MetadataRoute } from "next";
import { getEditorialSection } from "@/lib/sitemap-data";

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return (await getEditorialSection()).entries;
}
