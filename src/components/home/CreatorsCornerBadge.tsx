import Link from "next/link";

// The creators hub, visible on the homepage before any scroll (owner, 2026-10-15:
// "make it more obvious, maybe in the corner, without needing to scroll down").
// In the hero's top-right corner from sm up; on a phone, where a corner badge
// would sit on the headline, a small centred pill above it instead. Server
// component, static: nothing to fetch, nothing to hydrate.
export function CreatorsCornerBadge() {
  return (
    <Link
      href="/creators"
      className="group relative z-20 mb-3 inline-flex min-h-9 items-center gap-2 rounded-full border border-fuchsia-300/40 bg-gradient-to-r from-fuchsia-500/25 to-sky-500/25 py-1.5 pl-2 pr-3.5 text-xs font-bold text-white shadow-lg shadow-fuchsia-500/10 backdrop-blur transition-transform hover:scale-[1.04] hover:border-fuchsia-200/70 sm:absolute sm:right-4 sm:top-4 sm:mb-0 sm:text-sm"
    >
      <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-400 to-amber-300 text-[13px]" aria-hidden>
        ✨
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-ping rounded-full bg-fuchsia-300" />
      </span>
      <span>
        Riftbound creators
        <span className="ml-1.5 font-semibold text-fuchsia-200 group-hover:text-white">Buy them a pack →</span>
      </span>
    </Link>
  );
}
