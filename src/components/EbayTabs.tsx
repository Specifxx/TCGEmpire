"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export interface EbayTab {
  key: string;
  label: string;
  /** Shown as a small count pill beside the label. Omit for no pill. */
  count?: number;
  content: ReactNode;
}

/**
 * The tab shell for the card page's and QuickView's eBay panels.
 *
 * Visual language is the site's existing one — the pill row from
 * PopularCardsCarousel, same sizes, same brand-500-on-ink-950 active state — so
 * this reads as part of the page rather than a new widget. What it adds is the
 * accessibility that pattern lacks: PopularCardsCarousel uses `aria-pressed`,
 * which describes a toggle button, not a tab set. Screen readers get no sense of
 * "3 tabs, showing 1 of 3", and arrow keys do nothing.
 *
 * So this implements the real WAI-ARIA tabs pattern: tablist/tab/tabpanel with
 * aria-controls wiring, roving tabindex (only the active tab is in the tab
 * order), and Left/Right/Home/End to move between tabs.
 *
 * Tabs with no content are dropped by the CALLER, not hidden here — a tab that
 * renders an empty panel is worse than one that never existed, and only the
 * caller knows whether "no graded listings" means empty or still loading.
 */
export function EbayTabs({
  tabs,
  label,
  className,
}: {
  tabs: EbayTab[];
  /** Accessible name for the tablist, e.g. "eBay listings for Akali". */
  label: string;
  className?: string;
}) {
  const baseId = useId();
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // A tab disappearing (its listings expired between renders) must not leave the
  // panel pointing at nothing.
  useEffect(() => {
    if (active >= tabs.length) setActive(0);
  }, [tabs.length, active]);

  if (tabs.length === 0) return null;
  const current = tabs[Math.min(active, tabs.length - 1)];

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, i: number) {
    const last = tabs.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = i === last ? 0 : i + 1;
    else if (e.key === "ArrowLeft") next = i === 0 ? last : i - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  }

  // A single tab is not a choice — render the panel without the chrome rather
  // than showing a tablist of one, which reads as a broken control.
  const showTabs = tabs.length > 1;

  return (
    <div className={className}>
      {showTabs && (
        <div role="tablist" aria-label={label} className="mb-3 flex flex-wrap gap-2">
          {tabs.map((t, i) => {
            const isActive = i === active;
            return (
              <button
                key={t.key}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${t.key}`}
                aria-selected={isActive}
                aria-controls={`${baseId}-panel-${t.key}`}
                // Roving tabindex: Tab reaches the tablist once, arrows move within it.
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActive(i)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-xs font-bold uppercase tracking-wide transition-colors ${
                  isActive
                    ? "bg-brand-500 text-ink-950"
                    : "bg-ink-900 text-slate-400 hover:bg-ink-800 hover:text-white"
                }`}
              >
                {t.label}
                {t.count != null && (
                  <span
                    className={`num rounded-full px-1.5 text-[10px] font-bold ${
                      isActive ? "bg-ink-950/20 text-ink-950" : "bg-ink-800 text-slate-500"
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      <div
        role={showTabs ? "tabpanel" : undefined}
        id={`${baseId}-panel-${current.key}`}
        aria-labelledby={showTabs ? `${baseId}-tab-${current.key}` : undefined}
        // Focusable so a keyboard user can reach panel content that has no
        // focusable children of its own (WAI-ARIA authoring practice).
        tabIndex={showTabs ? 0 : undefined}
        className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        {current.content}
      </div>
    </div>
  );
}
