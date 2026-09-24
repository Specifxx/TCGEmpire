import type { Metadata } from "next";
import { regionMetadata } from "@/lib/home-metadata";
import { RegionHome } from "@/components/home/RegionHome";

// Region home page — Singapore. See app/au/page.tsx for the shared shape.
export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return regionMetadata("SG");
}

export default function SgHomePage() {
  return <RegionHome region="SG" />;
}
