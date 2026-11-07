import { FeaturedListingBox } from "@/components/FeaturedListingBox";
import { homeFeaturedListing } from "@/lib/featured-listings";

// A hand-picked eBay listing near the top of every home (owner, 2026-11-07:
// "feature this listing on the homepage of Riftcompare until it ends"). The
// same labelled box as the card page's (lib/featured-listings.ts), with eBay's
// own photo; it removes itself in the browser when the listing ends, so the
// six-hour home cache can never show it after that. Nothing when none is on.
export function HomeFeaturedListing() {
  const listing = homeFeaturedListing();
  if (!listing) return null;
  return (
    <section aria-label="Featured eBay listing">
      <FeaturedListingBox listing={listing} imageUrl={listing.imageUrl} className="" pageType="homepage" />
    </section>
  );
}
