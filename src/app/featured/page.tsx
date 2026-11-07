import type { Metadata } from "next";
import Link from "next/link";
import { FeaturedListingBox } from "@/components/FeaturedListingBox";
import { FeatureYourListing } from "@/components/FeatureYourListing";
import { FEATURED_LISTINGS, featuredLapsesAt, type FeaturedListing } from "@/lib/featured-listings";
import { getLiveFeatured } from "@/lib/featured/server";
import { FEATURE_DAYS, MEMBER_FEATURE_LIMIT } from "@/lib/featured/core";
import { SITE_URL } from "@/lib/site";
import { pageAlternates } from "@/lib/seo";

// FEATURED LISTINGS (owner, 2026-11-07: "sellers … feature their listing on our
// website on a featured page", a Premium feature). The hand-picked listings
// (lib/featured-listings.ts) and every Premium member's live listing
// (lib/featured/), each in the labelled box the homepage uses. Six hours, and
// purged after each four-hourly eBay check, so a new listing appears within
// about four hours. DECISIONS.md, "Premium members feature their own eBay listings".
export const revalidate = 21600;

export const metadata: Metadata = {
  title: { absolute: "Featured Riftbound eBay Listings | RiftCompare" },
  description:
    "Riftbound cards and sealed product that sellers are featuring on RiftCompare: live eBay auctions and Buy It Now listings with eBay's photo, price and end time. Premium members can feature their own.",
  alternates: pageAlternates("/featured"),
  openGraph: {
    title: "Featured Riftbound eBay Listings",
    description: "Live Riftbound listings sellers are featuring on RiftCompare.",
    url: `${SITE_URL}/featured`,
  },
};

export default async function FeaturedPage() {
  const now = Date.now();
  let members: FeaturedListing[] = [];
  try {
    members = await getLiveFeatured();
  } catch {
    members = [];
  }
  const picked = FEATURED_LISTINGS.filter((f) => now < featuredLapsesAt(f));
  const live = [...picked, ...members.filter((m) => now < featuredLapsesAt(m) && !picked.some((p) => p.itemId === m.itemId))];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-gold">Featured listings</p>
        <h1 className="mt-1 text-3xl font-extrabold text-white">Featured Riftbound listings on eBay</h1>
        <p className="mt-2 text-sm text-slate-400">
          Listings their sellers are featuring on RiftCompare. Every title, photo, price and end time is eBay&apos;s own, read
          from eBay every few hours. They are ads: never part of a price comparison, and never ranked into one.
        </p>
      </header>

      <FeatureYourListing limit={MEMBER_FEATURE_LIMIT} days={FEATURE_DAYS} />

      <section aria-labelledby="featured-live" className="flex flex-col gap-4">
        <h2 id="featured-live" className="text-xl font-extrabold text-white">
          Featured now
        </h2>
        {live.length === 0 ? (
          <p className="rounded-xl border border-ink-700 bg-ink-900 p-4 text-sm text-slate-400">
            Nothing is featured right now. Browse <Link href="/auctions" className="text-brand-400 hover:underline">live chase auctions</Link> instead.
          </p>
        ) : (
          live.map((l) => <FeaturedListingBox key={l.itemId} listing={l} imageUrl={l.imageUrl} className="" pageType="featured" />)
        )}
      </section>
    </div>
  );
}
