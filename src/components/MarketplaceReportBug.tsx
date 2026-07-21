import Link from "next/link";

// Shown beside every marketplace surface's heading — makes reporting a problem
// one click away. Deep-links into /support pre-filled (see SupportForm's
// defaultCategory/defaultSubject props) so a bug report doesn't require
// re-explaining context.
export function MarketplaceReportBug({ subject = "Marketplace bug: " }: { subject?: string }) {
  return (
    <Link
      href={`/support?category=OTHER&subject=${encodeURIComponent(subject)}`}
      className="text-xs font-semibold text-brand-400 hover:underline"
    >
      Found a bug? Report it →
    </Link>
  );
}
