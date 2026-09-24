// "Sep 2026" for an article title, derived from an ISO date the article already
// carries (its `updated`), so the month in the title and the page's
// dateModified can never disagree. Used only where content is genuinely
// time-sensitive — the ban list and the live price ranking (2026-09-24 CTR pass).
// Its own module because both lib/articles.ts and lib/content/seo-pack-articles.ts
// (which articles.ts imports) call it while building their arrays.
export function monthYear(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}
