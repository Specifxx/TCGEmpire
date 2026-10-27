import { ratingLine, type SiteRating } from "@/lib/site-rating";

// The site's star rating, Collectr-style, wherever it earns its place: the
// homepage hero and the Pro page (owner, 2026-10-27: "once we have like 100
// people provide us feedback … put the feedback on the website in the best
// positions"). Renders nothing until lib/site-rating.ts has 100 real ratings.
// Plain HTML, never review markup: a site rating published by the site itself
// is self-serving under Google's review-snippet rules.

export function Stars({ average }: { average: number }) {
  const full = Math.round(average);
  return (
    <span aria-hidden className="tracking-tight text-gold">
      {"★".repeat(full)}
      <span className="text-ink-600">{"★".repeat(5 - full)}</span>
    </span>
  );
}

export function SiteRatingBadge({ rating, className = "" }: { rating: SiteRating | null | undefined; className?: string }) {
  if (!rating) return null;
  return (
    <p className={`flex items-center justify-center gap-2 text-sm text-slate-300 ${className}`} data-site-rating>
      <Stars average={rating.average} />
      <span>{ratingLine(rating)} from players</span>
    </p>
  );
}
