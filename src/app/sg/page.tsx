import type { Metadata } from "next";
import { regionHomeMetadata } from "@/lib/seo";
import { RegionHome } from "@/components/home/RegionHome";

// Region home page — Singapore. See app/au/page.tsx for the shared shape.
export const revalidate = 3600;

export const metadata: Metadata = regionHomeMetadata("SG");

export default function SgHomePage() {
  return <RegionHome region="SG" />;
}
