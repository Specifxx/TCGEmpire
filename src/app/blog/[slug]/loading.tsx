// Instant loading state for blog posts + the daily market wrap. The market-report
// view is chart-heavy and fetches on a cold ISR miss, so without this the tab looked
// frozen after clicking through from the homepage. A top progress bar gives immediate
// "it's working" feedback; the skeleton mirrors the article layout (mx-auto max-w-3xl,
// matching MarketReportView) so the arriving page doesn't jump.
export default function Loading() {
  return (
    <>
      {/* Indeterminate top progress bar — sits under the navbar, spans the viewport. */}
      <style>{`@keyframes rc-loadbar{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}`}</style>
      <div className="fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden bg-ink-800" aria-hidden>
        <div className="h-full w-1/4 bg-brand-500" style={{ animation: "rc-loadbar 1.05s ease-in-out infinite" }} />
      </div>

      <div className="mx-auto max-w-3xl animate-pulse" role="status" aria-label="Loading">
        {/* eyebrow + title */}
        <div className="h-4 w-28 rounded bg-ink-800" />
        <div className="mt-4 h-8 w-11/12 rounded bg-ink-800" />
        <div className="mt-2 h-8 w-2/3 rounded bg-ink-800" />
        <div className="mt-3 h-3 w-40 rounded bg-ink-800" />

        {/* stat tiles row (market wrap) */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-ink-800" />
          ))}
        </div>

        {/* chart block */}
        <div className="mt-6 h-56 rounded-xl bg-ink-800" />

        {/* body lines */}
        <div className="mt-6 space-y-2.5">
          {["w-full", "w-11/12", "w-full", "w-4/5", "w-10/12"].map((w, i) => (
            <div key={i} className={`h-3 rounded bg-ink-800 ${w}`} />
          ))}
        </div>
        <span className="sr-only">Loading…</span>
      </div>
    </>
  );
}
