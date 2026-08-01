import Link from "next/link";

// A visible, one-click report control on every marketplace listing.
//
// Unmoderated user-generated commerce is a standing AdSense risk, and the
// question a reviewer is actually asking is not "is this listing bad?" but "does
// anyone here check?". A report control that a logged-out visitor can see and
// use is the visible half of that answer; /marketplace/listing-policy is the
// other half. Deep-links into the existing support form with the listing already
// identified, so a report costs one click and no explanation of context.
export function ReportListing({
  listingId,
  cardName,
  className,
}: {
  listingId: string;
  cardName?: string;
  className?: string;
}) {
  const subject = `Report listing ${listingId}${cardName ? ` (${cardName})` : ""}`;
  return (
    <Link
      href={`/support?category=OTHER&subject=${encodeURIComponent(subject)}`}
      className={className ?? "text-[11px] text-slate-500 underline-offset-2 hover:text-rose-300 hover:underline"}
      // Reports are a support action, not content — never a crawl target.
      rel="nofollow"
    >
      Report listing
    </Link>
  );
}
