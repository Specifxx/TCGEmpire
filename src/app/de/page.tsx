import type { Metadata } from "next";
import { regionHomeMetadata } from "@/lib/seo";
import { RegionHome } from "@/components/home/RegionHome";

// Region home page — Germany. Real ISR, same cadence as "/" (see
// lib/home-stats.ts for why this shares the homepage's own cached stats
// rather than paying for a second query set).
export const revalidate = 3600;

export const metadata: Metadata = regionHomeMetadata("DE");

export default function DeHomePage() {
  return <RegionHome region="DE" />;
}
