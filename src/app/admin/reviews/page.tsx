import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { FeedbackActions } from "@/components/admin/FeedbackActions";
import { REVIEW_SITE_KEYS, loadReviewAdmin, type AdminReviewRow } from "@/lib/site-reviews/admin";
import { reviewSiteName } from "@/lib/site-reviews/sites";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reviews, every site",
  robots: { index: false, follow: false },
};

// EVERY SITE'S REVIEWS, APPROVED HERE (2026-11-03, owner: "for reviews I want to
// approve them in the riftcompare admin dashboard for all sites"; "star reviews
// are automatically on the website"). Stars count in each site's public score as
// they arrive; a written review shows on its site only after "Publish" here, and
// only when its writer left "Show my review" ticked (the API refuses the rest).
// A published review reaches the site within six hours (the CDN copy of
// /api/site-reviews/<site>). DECISIONS.md, "Every site's reviews, approved in one queue".
export default async function AdminReviewsPage({ searchParams }: { searchParams: { key?: string; site?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const user = await getCurrentUser();
  if (!(keyOk || user?.isAdmin)) notFound();

  const adminKey = keyOk ? token! : "";
  const keyParam = keyOk && !user?.isAdmin ? `key=${encodeURIComponent(token!)}` : "";
  const href = (site?: string) => {
    const q = [site ? `site=${site}` : "", keyParam].filter(Boolean).join("&");
    return `/admin/reviews${q ? `?${q}` : ""}`;
  };
  const site = searchParams.site && REVIEW_SITE_KEYS.includes(searchParams.site) ? searchParams.site : null;

  let data: Awaited<ReturnType<typeof loadReviewAdmin>> | null = null;
  try {
    data = await loadReviewAdmin(site);
  } catch {
    data = null;
  }

  const date = (d: Date) => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" });

  const Row = ({ r }: { r: AdminReviewRow }) => (
    <div className="rounded-xl border border-ink-700 bg-ink-850 p-4" data-review-row>
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip bg-ink-800 text-slate-300">{reviewSiteName(r.site)}</span>
        {r.rating != null && (
          <span className="chip bg-gold/15 text-gold" aria-label={`${r.rating} out of 5`}>
            {"★".repeat(r.rating)}
            <span className="text-gold/30">{"★".repeat(5 - r.rating)}</span>
          </span>
        )}
        <span className="text-sm font-medium text-white">{r.consentPublic ? r.displayName?.trim() || "Verified visitor" : "Private feedback"}</span>
        <span className="ml-auto text-xs text-slate-500">{date(r.createdAt)}</span>
      </div>
      {r.page && <div className="mt-1 text-[11px] text-slate-600">on {r.page}</div>}
      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{r.message}</p>
      <FeedbackActions id={r.id} status={r.status} consentPublic={r.consentPublic} adminKey={adminKey} />
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <nav className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
        <Link href={`/admin${keyParam ? `?${keyParam}` : ""}`} className="hover:text-slate-300">Admin</Link>
        <span>/</span>
        <span className="text-slate-300">Reviews, every site</span>
      </nav>
      <h1 className="text-2xl font-bold text-white">Reviews, every site</h1>
      <p className="mt-1 text-sm text-slate-400">
        Star ratings count on each site straight away. Written reviews show on their site only after you publish them here,
        within six hours. Spam a rating to take it out of the score.
      </p>

      {!data ? (
        <div className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">Couldn&apos;t load reviews right now.</div>
      ) : (
        <>
          <div className="mt-6 overflow-x-auto rounded-xl border border-ink-700">
            <table className="w-full text-sm" data-review-summary>
              <thead className="bg-ink-900 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Site</th>
                  <th className="px-3 py-2 text-right">Score</th>
                  <th className="px-3 py-2 text-right">Ratings</th>
                  <th className="px-3 py-2 text-right">To approve</th>
                  <th className="px-3 py-2 text-right">Published</th>
                </tr>
              </thead>
              <tbody>
                {data.summaries.map((s) => (
                  <tr key={s.key} className={`border-t border-ink-800 ${site === s.key ? "bg-brand-500/5" : ""}`}>
                    <td className="px-3 py-2">
                      <Link href={href(site === s.key ? undefined : s.key)} className="font-medium text-white hover:text-brand-300">
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right text-slate-300">{s.average != null ? <>{s.average.toFixed(1)} <span className="text-gold">★</span></> : "–"}</td>
                    <td className="px-3 py-2 text-right text-slate-400">{s.ratings.toLocaleString()}</td>
                    <td className={`px-3 py-2 text-right ${s.waiting ? "font-bold text-gold" : "text-slate-500"}`}>{s.waiting}</td>
                    <td className="px-3 py-2 text-right text-slate-400">{s.published}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {site && (
            <p className="mt-2 text-xs text-slate-500">
              Showing {reviewSiteName(site)} only. <Link href={href()} className="text-brand-400 hover:underline">Show every site</Link>
            </p>
          )}

          <section className="mt-8">
            <h2 className="text-lg font-bold text-white">Waiting for approval ({data.waiting.length})</h2>
            {data.waiting.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Nothing waiting.</p>
            ) : (
              <div className="mt-3 space-y-3">{data.waiting.map((r) => <Row key={r.id} r={r} />)}</div>
            )}
          </section>

          <details className="mt-8 rounded-xl border border-ink-700 bg-ink-900/40 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-brand-300">
              Private feedback, not for publishing ({data.privateRows.length})
            </summary>
            <p className="mt-2 text-xs text-slate-500">The writer unticked &ldquo;Show my review&rdquo;. Archive it once read. RiftCompare&apos;s own are in the Inbox.</p>
            <div className="mt-3 space-y-3">{data.privateRows.map((r) => <Row key={r.id} r={r} />)}</div>
          </details>

          <details className="mt-3 rounded-xl border border-ink-700 bg-ink-900/40 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-brand-300">Published ({data.published.length})</summary>
            <div className="mt-3 space-y-3">{data.published.map((r) => <Row key={r.id} r={r} />)}</div>
          </details>
        </>
      )}
    </div>
  );
}
