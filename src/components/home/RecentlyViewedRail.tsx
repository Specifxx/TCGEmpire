"use client";

import Link from "next/link";
import { useRecentCards } from "@/lib/recently-viewed";
import { cardHref } from "@/lib/card-url";
import { trackEvent } from "@/lib/analytics";
import { cardArtThumb, cardImageSrcSet } from "@/lib/card-image-url";

// Client-only "cards you've looked at" chip row — reads localStorage via
// useRecentCards(), so it renders nothing on the server and nothing on a
// visitor's first-ever view (see lib/recently-viewed.ts for the writers).
// `<p className="rb-eyebrow">`, not an `<h2>`: the homepage's own heading
// budget (scripts/homepage-audit.mjs) counts real headings, and this is a
// label, not a section a crawler should index as one.
export function RecentlyViewedRail({ exclude, className }: { exclude?: string; className?: string }) {
  const recent = useRecentCards().filter((c) => c.id !== exclude);
  if (recent.length === 0) return null;

  return (
    <div className={className}>
      <p className="rb-eyebrow text-slate-500">Recently viewed</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {recent.slice(0, 8).map((c, i) => (
          <li key={c.id}>
            <Link
              href={cardHref(c)}
              onClick={() => trackEvent("recent_viewed_click", { card_id: c.id, rank: i + 1 })}
              className="chip border border-ink-700 bg-ink-900 py-1 pl-1 text-slate-300 transition-colors hover:border-brand-500/60 hover:text-white"
            >
              {c.imageSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cardArtThumb(c.imageSrc)} srcSet={cardImageSrcSet(c.imageSrc) ?? undefined} sizes="18px" alt="" aria-hidden="true" width={18} height={25} loading="lazy" decoding="async" className="h-6 w-[18px] shrink-0 rounded-sm object-cover" />
              )}
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
