import Link from "next/link";
import { getApprovedReviews, MIN_REVIEWS_TO_DISPLAY } from "@/lib/reviews";

// Real, consented, admin-approved reviews from real visitors — or nothing at
// all. There is no placeholder state, no "be the first!" empty card and no
// seeded example: on a site with no reviews yet, the honest render is no
// section, and anything else is a fabricated endorsement.
//
// DELIBERATELY NO schema.org Review / AggregateRating MARKUP. Google's
// structured-data guidelines disallow "self-serving" review markup — ratings
// about an entity, published by that same entity on its own site, are not
// eligible for review rich results and marking them up anyway risks a manual
// action against the whole domain. These render as ordinary HTML. If star
// snippets are ever wanted, they have to come from a third-party review
// platform, not from us marking up our own testimonials.
export async function ReviewsSection() {
  const reviews = await getApprovedReviews(6);
  if (reviews.length < MIN_REVIEWS_TO_DISPLAY) return null;

  return (
    <section aria-labelledby="rc-reviews-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="rc-reviews-heading" className="text-xl font-extrabold text-white">What people say</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Real feedback from people using RiftCompare, shared with their permission.
          </p>
        </div>
        <Link href="/feedback" className="btn-ghost hidden text-xs sm:inline-flex">
          Add yours →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reviews.map((r) => (
          <figure key={r.id} className="card-surface flex flex-col p-5">
            {r.rating != null && (
              <div className="text-sm text-gold" aria-label={`${r.rating} out of 5`}>
                {"★".repeat(r.rating)}
                <span className="text-ink-600">{"★".repeat(5 - r.rating)}</span>
              </div>
            )}
            <blockquote className="mt-2 flex-1 text-sm leading-relaxed text-slate-300">{r.message}</blockquote>
            <figcaption className="mt-3 text-xs text-slate-500">
              {r.displayName?.trim() ? r.displayName : "Verified visitor"}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
