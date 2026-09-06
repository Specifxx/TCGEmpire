import type { Metadata } from "next";
import { regionHomeMetadata } from "@/lib/seo";
import { RegionHome } from "@/components/home/RegionHome";

// Region home page — the eurozone. See app/au/page.tsx for the shared shape.
//
// The one region page whose market is not a country: "EU" covers ~20 member
// states that share a currency and a customs union, so the stores it ranks are
// spread across them rather than sitting in one (see lib/country.ts's header
// note on why the market is drawn that way).
export const revalidate = 3600;

export const metadata: Metadata = regionHomeMetadata("EU");

export default function EuHomePage() {
  return <RegionHome region="EU" />;
}
