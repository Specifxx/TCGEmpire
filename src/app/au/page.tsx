import type { Metadata } from "next";
import { regionMetadata } from "@/lib/home-metadata";
import { RegionHome } from "@/components/home/RegionHome";

// Region home page — Australia. Real ISR, same cadence as "/" (see
// lib/home-stats.ts for why this shares the homepage's own cached stats rather
// than paying for a second query set). Six hours since 2026-10-14
// (DECISIONS.md, "Cached pages refresh every 6 to 24 hours", 2026-10-14); each
// price import still refreshes it on demand.
export const revalidate = 21600;

export function generateMetadata(): Promise<Metadata> {
  return regionMetadata("AU");
}

export default function AuHomePage() {
  return <RegionHome region="AU" />;
}
