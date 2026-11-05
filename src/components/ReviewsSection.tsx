import { FeedbackLink } from "./FeedbackLink";
import { getApprovedReviews, MIN_REVIEWS_TO_DISPLAY } from "@/lib/reviews";
import type { SiteRating } from "@/lib/site-rating";

// Real, consented, admin-approved reviews from real visitors — or nothing at
// all. There is no placeholder state, no "be the first!" empty card and no
// seeded example: on a site with no reviews yet, the honest render is no
// section, and anything else is a fabricated endorsement.
//
// WHERE (owner, 2026-11-03: "we have a couple reviews published … we need it
// visible on the home page and the pricing page"): directly under the homepage
// hero and directly under the Premium page's hero, with the site's rating (the
// average of every star rating sent, and how many) beside them. Before that it
// sat below the popular-cards carousel and below the nine Premium feature panels,
// where nobody scrolled to it. In the site's own theme, like the 2026-11-02
// Premium page: flat ink panels, hairline borders, the brand orange for the stars.
// No pop-up, no ask beyond the quiet "Rate & review" button.
//
// DELIBERATELY NO schema.org Review or aggregate-rating MARKUP. Google's
// structured-data guidelines disallow "self-serving" review markup — ratings
// about an entity, published by that same entity on its own site, are not
// eligible for review rich results and marking them up anyway risks a manual
// action against the whole domain. These render as ordinary HTML. If star
// snippets are ever wanted, they have to come from a third-party review
// platform, not from us marking up our own testimonials.

function Stars({ rating, className = "" }: { rating: number; className?: string }) {
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span aria-hidden className={`tracking-tight text-brand-400 ${className}`}>
      {"★".repeat(full)}
      <span className="text-ink-600">{"★".repeat(5 - full)}</span>
    </span>
  );
}

export async function ReviewsSection({ rating = null, limit = 3 }: { rating?: SiteRating | null; limit?: number }) {
  const reviews = await getApprovedReviews(limit);
  if (reviews.length < MIN_REVIEWS_TO_DISPLAY) return null;

  return (
    <section aria-labelledby="rc-reviews-heading" data-reviews>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="rc-reviews-heading" className="text-xl font-extrabold text-white">What people say</h2>
          {rating ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-300" data-reviews-summary>
              <Stars rating={rating.average} />
              <span>
                <span className="font-mono font-bold text-white">{rating.average.toFixed(1)}</span> out of 5 from{" "}
                {rating.count.toLocaleString("en-US")} {rating.count === 1 ? "rating" : "ratings"}
              </span>
            </p>
          ) : null}
          <p className="mt-0.5 text-xs text-slate-500">
            Real reviews from people using RiftCompare, read by a person before they appear.
          </p>
        </div>
        <FeedbackLink className="btn-ghost text-xs">Rate &amp; review →</FeedbackLink>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {reviews.map((r) => (
          <figure key={r.id} className="flex flex-col rounded-lg border border-ink-800 bg-ink-900 p-5">
            {r.rating != null && (
              <div className="text-sm" role="img" aria-label={`${r.rating} out of 5`}>
                <Stars rating={r.rating} />
              </div>
            )}
            <blockquote className="mt-2 flex-1 whitespace-pre-line text-sm leading-relaxed text-slate-300">{r.message}</blockquote>
            <figcaption className="mt-3 text-xs font-medium text-slate-500">
              {r.displayName?.trim() ? r.displayName : "Verified visitor"}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
