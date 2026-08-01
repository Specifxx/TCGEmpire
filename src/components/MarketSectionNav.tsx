"use client";

import { useEffect, useState } from "react";

type Section = { id: string; label: string };

// A sticky in-page jump nav for the long /market page: anchor links plus a live
// active-section highlight (IntersectionObserver) so it's easy to navigate while
// scrolling. No-JS safe — the links still jump; only the highlight needs JS. It's
// sticky under the 64px navbar on desktop; on phones the navbar height varies with
// its search row, so there it's a normal scroll-along bar (no risky overlap).
export function MarketSectionNav({ sections }: { sections: Section[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el != null);
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // The topmost section currently crossing the observation band wins.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActive(visible[0].target.id);
      },
      // Bias the band to the upper viewport so the active item flips as a section
      // reaches the top, accounting for the sticky header + this nav.
      { rootMargin: "-120px 0px -65% 0px", threshold: 0 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  if (sections.length < 2) return null;

  return (
    <nav
      aria-label="Index sections"
      className="z-30 rounded-lg border border-ink-800 bg-ink-950/80 px-2 backdrop-blur-md lg:sticky lg:top-16"
    >
      <ul className="flex gap-1 overflow-x-auto py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((s) => {
          const isActive = active === s.id;
          return (
            <li key={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                aria-current={isActive ? "true" : undefined}
                className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold transition-colors sm:min-h-0 sm:py-1.5 ${
                  isActive
                    ? "bg-brand-500/15 text-brand-300"
                    : "text-slate-400 hover:bg-ink-800 hover:text-white"
                }`}
              >
                {s.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
