import Link from "next/link";

// Shown beside every marketplace surface's heading — the marketplace is new,
// so every page should say so and make reporting a problem one click away.
// Deep-links into /support pre-filled (see SupportForm's defaultCategory/
// defaultSubject props) so a bug report doesn't require re-explaining context.
export function MarketplaceBetaBadge({ subject = "Marketplace bug: " }: { subject?: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2 align-middle">
      <span
        className="chip bg-gold/15 text-[10px] font-bold uppercase tracking-wide text-gold"
        title="The marketplace is new — features and policies may still change."
      >
        🧪 Beta
      </span>
      <Link
        href={`/support?category=OTHER&subject=${encodeURIComponent(subject)}`}
        className="text-xs font-semibold text-brand-400 hover:underline"
      >
        Found a bug? Report it →
      </Link>
    </span>
  );
}
