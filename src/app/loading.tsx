// Shown instantly on every navigation while the destination page streams in —
// so the tab swap feels immediate and the data loads once you're already there.
//
// IMPORTANT: this must fill the whole viewport (minus the navbar). At its old
// 55vh the footer and the layout-level ad banner sat in view during the load,
// then got shoved down by the arriving page — a 0.4–0.6 CLS hit on every
// dynamic route (/, /card, /forum, /decks…), the site's biggest shift source.
export default function Loading() {
  return (
    <div className="flex min-h-[calc(100dvh-6rem)] flex-col items-center justify-center gap-3 text-slate-500">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink-700 border-t-brand-400" />
      <p className="text-sm">Loading…</p>
    </div>
  );
}
