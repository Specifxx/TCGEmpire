import type { Metadata } from "next";
import { regionMetadata } from "@/lib/home-metadata";
import { RegionHome } from "@/components/home/RegionHome";

// Region home page — Canada. See app/au/page.tsx for the shared shape.
export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return regionMetadata("CA");
}

export default function CaHomePage() {
  return <RegionHome region="CA" />;
}
