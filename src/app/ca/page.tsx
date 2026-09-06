import type { Metadata } from "next";
import { regionHomeMetadata } from "@/lib/seo";
import { RegionHome } from "@/components/home/RegionHome";

// Region home page — Canada. See app/au/page.tsx for the shared shape.
export const revalidate = 3600;

export const metadata: Metadata = regionHomeMetadata("CA");

export default function CaHomePage() {
  return <RegionHome region="CA" />;
}
