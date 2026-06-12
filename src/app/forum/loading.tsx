export default function Loading() {
  return (
    // min-h fills the viewport so the footer/banner below start off-screen and
    // aren't shoved down when the board streams in (CLS).
    <div className="min-h-[calc(100dvh-6rem)]">
      <div className="mb-5 h-7 w-44 animate-pulse rounded bg-ink-800" />
      <div className="mb-4 flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-7 w-24 animate-pulse rounded bg-ink-800" />
        ))}
      </div>
      <p className="mb-4 flex items-center gap-2 text-sm text-slate-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-700 border-t-brand-400" />
        Fetching posts…
      </p>
      <ul className="space-y-3">
        {[0, 1, 2].map((i) => (
          <li key={i} className="card-surface h-28 animate-pulse" />
        ))}
      </ul>
    </div>
  );
}
