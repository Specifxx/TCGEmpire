// Shown while the results page loads after a search/filter — gives a clear
// "page is loading" state instead of a silent lag.
export default function Loading() {
  return (
    // min-h fills the viewport so the footer/banner can't sit in view during the
    // load and get shoved down by the arriving grid (CLS).
    <div className="flex min-h-[calc(100dvh-6rem)] flex-col gap-6 lg:flex-row">
      <aside className="w-full shrink-0 lg:w-64">
        <div className="card-surface h-72 animate-pulse" />
      </aside>
      <section className="min-w-0 flex-1">
        <p className="mb-4 flex items-center gap-2 text-sm text-slate-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-700 border-t-brand-400" />
          Loading the card database…
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="card-surface overflow-hidden">
              <div className="aspect-[5/7] w-full animate-pulse bg-ink-800" />
              <div className="space-y-2 p-3">
                <div className="h-3 w-3/4 animate-pulse rounded bg-ink-800" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-ink-800" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
