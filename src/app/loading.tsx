// Shown instantly on every navigation while the destination page streams in —
// so the tab swap feels immediate and the data loads once you're already there.
export default function Loading() {
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 text-slate-500">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink-700 border-t-brand-400" />
      <p className="text-sm">Loading…</p>
    </div>
  );
}
