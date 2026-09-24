import type { Metadata } from "next";
import { regionMetadata } from "@/lib/home-metadata";
import { RegionHome } from "@/components/home/RegionHome";

// Region home page — Australia. Real ISR, same cadence as "/" (see
// lib/home-stats.ts for why this shares the homepage's own cached stats
// rather than paying for a second query set).
export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return regionMetadata("AU");
}

export default function AuHomePage() {
  return <RegionHome region="AU" />;
}
