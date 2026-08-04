// The route-transition placeholder, shared by the scoped loading.tsx files.
//
// It must fill the viewport (minus the navbar). At its old 55vh the footer and
// the layout-level ad banner sat in view during the load and then got shoved
// down by the arriving page — a 0.4–0.6 CLS hit on every dynamic route.
export function RouteLoading() {
  return (
    <div className="flex min-h-[calc(100dvh-6rem)] flex-col items-center justify-center gap-3 text-slate-500">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink-700 border-t-brand-400" />
      <p className="text-sm">Loading…</p>
    </div>
  );
}
