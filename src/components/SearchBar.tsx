"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cardHref } from "@/lib/card-url";
import { cardDisplayName } from "@/lib/card-name";
import { useQuickView } from "./QuickView";
import { useCountry } from "./CountryProvider";
import type { CardTileData } from "./CardTile";
import { cardImageAlt } from "@/lib/image-alt";
import { gaEvent } from "@/lib/ga-events";

// How long a focused-but-not-yet-typing field has to stay focused before it
// counts as "focus with intent" for search_initiated below — long enough that
// a tab-through or an accidental click-and-immediate-blur doesn't count, short
// enough that a visitor who focused the box and is composing what to type
// still gets counted before they've necessarily typed anything.
const FOCUS_INTENT_MS = 1200;

type Result = CardTileData;
type SealedResult = {
  groupKey: string;
  name: string;
  productType: string;
  setCode: string | null;
  imageUrl: string | null;
  lowestPriceCents: number | null;
};

// Search with a live preview dropdown (debounced + abortable so typing stays
// snappy). Submitting still does a real navigation to the results page.
//
// `variant="hero"` is the same component, just sized up for the homepage hero
// (wider, larger type/touch target) with the hero's own placeholder copy —
// there's exactly one search implementation, wired once, reused in both spots.
// `autoFocusDesktop` focuses the input on mount, but ONLY above the `lg`
// breakpoint — never on mobile, where a stolen-focus keyboard pop-up on load is
// just annoying and shifts the layout before the visitor has scrolled to it.
export function SearchBar({
  variant = "nav",
  autoFocusDesktop = false,
}: {
  variant?: "nav" | "hero";
  autoFocusDesktop?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { open: openQuickView } = useQuickView();
  const { fmt, price } = useCountry();
  const [value, setValue] = useState(params.get("q") ?? "");
  const [results, setResults] = useState<Result[]>([]);
  const [sealed, setSealed] = useState<SealedResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // search_initiated fires exactly once per mount — the first sign a visitor
  // is actually trying to search, not every keystroke/focus after that.
  const initiatedRef = useRef(false);
  const focusIntentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // search_initiated: "first keystroke OR focus-with-intent" per the
  // measurement brief — two different signals feeding one event, because both
  // are evidence of the same thing (a visitor engaging with search), just
  // with different timing. A keystroke is unambiguous and fires immediately.
  // A bare focus is not on its own (tabbing past the field, or a click that's
  // about to become something else, both focus it) — so a focus only counts
  // once it's been held for FOCUS_INTENT_MS without either blurring or typing
  // (typing marks `initiated` itself, so the pending timer below becomes a
  // no-op when it eventually fires).
  function markInitiated(trigger: "keystroke" | "focus_dwell") {
    if (initiatedRef.current) return;
    initiatedRef.current = true;
    gaEvent("search_initiated", { trigger, variant });
  }

  function clearFocusIntentTimer() {
    if (focusIntentTimerRef.current != null) {
      clearTimeout(focusIntentTimerRef.current);
      focusIntentTimerRef.current = null;
    }
  }

  useEffect(() => {
    if (autoFocusDesktop && window.matchMedia("(min-width: 1024px)").matches) {
      inputRef.current?.focus();
    }
    // Mount-only: re-focusing on every re-render would steal focus back from
    // whatever the visitor moved to next.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tear down a pending focus-intent timer if the component unmounts while
  // it's running (e.g. navigating away right after focusing the box).
  useEffect(() => clearFocusIntentTimer, []);

  // Debounced fetch of preview results.
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setSealed([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const data = await res.json();
        const nextResults: Result[] = data.results ?? [];
        const nextSealed: SealedResult[] = data.sealed ?? [];
        setResults(nextResults);
        setSealed(nextSealed);
        // A free product-gap report: every distinct, debounced-settled query
        // that came back completely empty. Firing per settled query (not per
        // keystroke — the 180ms debounce above already collapses a fast typist
        // down to the strings they actually paused on) keeps this from
        // flooding GA4 while still catching every real miss, including
        // transient ones the visitor typed past on the way to a hit.
        if (nextResults.length === 0 && nextSealed.length === 0) {
          gaEvent("search_no_results", { query: q, variant });
        }
      } catch {
        /* aborted or failed — ignore */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [value, variant]);

  // Close on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    gaEvent("search_submitted", { query: q, variant });
    setOpen(false);
    router.push(q ? `/browse?q=${encodeURIComponent(q)}` : "/browse");
  }

  const showDropdown = open && value.trim().length >= 2;
  const isHero = variant === "hero";

  return (
    <div ref={boxRef} className={`relative ${isHero ? "mx-auto w-full max-w-2xl" : "max-w-xl"}`}>
      <form onSubmit={submit}>
        <svg
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-500 ${
            isHero ? "left-4 h-5 w-5" : "left-3 h-4 w-4"
          }`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            if (next.length > 0) {
              clearFocusIntentTimer();
              markInitiated("keystroke");
            }
            setValue(next);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            if (!initiatedRef.current && focusIntentTimerRef.current == null) {
              focusIntentTimerRef.current = setTimeout(() => {
                focusIntentTimerRef.current = null;
                markInitiated("focus_dwell");
              }, FOCUS_INTENT_MS);
            }
          }}
          onBlur={clearFocusIntentTimer}
          placeholder={isHero ? "Search any Riftbound card…" : "Search cards, champions, sets…"}
          className={isHero ? "input py-3.5 pl-11 text-base sm:text-lg" : "input pl-9"}
          aria-label="Search cards"
          autoComplete="off"
          enterKeyHint="search"
        />
      </form>

      {showDropdown && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-ink-700 bg-ink-850 shadow-2xl">
          {results.length === 0 && sealed.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-400">
              {loading ? "Searching…" : "No matches — press Enter to search anyway."}
            </div>
          ) : (
            <ul className="max-h-[70vh] overflow-y-auto py-1">
              {results.map((r, i) => (
                <li key={r.id}>
                  <Link
                    href={cardHref(r)}
                    prefetch={false}
                    onClick={(e) => {
                      // A search-result click is the key demand signal (drives eBay
                      // priority) — record it however they open the card.
                      fetch(`/api/card/${r.slug ?? r.id}/view?source=search`, { method: "POST", keepalive: true }).catch(() => {});
                      // Rank is 1-based across the WHOLE dropdown (cards first,
                      // then sealed below) — it matches what the visitor actually
                      // saw top-to-bottom, not two independent per-section counts.
                      gaEvent("search_suggestion_selected", {
                        suggestion_rank: i + 1,
                        result_type: "card",
                        query: value.trim(),
                        card_id: r.id,
                        variant,
                      });
                      // Left-click opens the instant modal (fast); modifier/middle
                      // click still opens the full page in a new tab.
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                      e.preventDefault();
                      setOpen(false);
                      openQuickView(r);
                    }}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-ink-800"
                  >
                    <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-ink-900">
                      {r.imageThumbUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.imageThumbUrl} alt={cardImageAlt(r)} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white">{cardDisplayName(r.name, r)}</div>
                      <div className="text-xs text-slate-500">
                        {r.setCode} · {r.collectorNumber}
                      </div>
                    </div>
                    <div className="shrink-0 text-sm font-bold text-accent">
                      {price(r) != null ? fmt(price(r)!) : "—"}
                    </div>
                  </Link>
                </li>
              ))}
              {sealed.length > 0 && (
                <>
                  <li className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Sealed products
                  </li>
                  {sealed.map((s, i) => (
                    <li key={s.groupKey}>
                      <Link
                        href={`/sealed?q=${encodeURIComponent(s.name)}`}
                        onClick={() => {
                          // Continues the card list's rank rather than restarting
                          // at 1 — see the comment on the card suggestions above.
                          gaEvent("search_suggestion_selected", {
                            suggestion_rank: results.length + i + 1,
                            result_type: "sealed",
                            query: value.trim(),
                            variant,
                          });
                          setOpen(false);
                        }}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-ink-800"
                      >
                        <div className="grid h-12 w-9 shrink-0 place-items-center overflow-hidden rounded bg-ink-900">
                          {s.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={s.imageUrl} alt="" aria-hidden="true" className="h-full w-full object-contain" loading="lazy" decoding="async" />
                          ) : (
                            <span className="text-[8px] font-semibold text-slate-600">SEALED</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-white">{s.name}</div>
                          <div className="text-xs text-slate-500">
                            {s.productType}{s.setCode ? ` · ${s.setCode}` : ""}
                          </div>
                        </div>
                        <div className="shrink-0 text-sm font-bold text-accent">
                          {s.lowestPriceCents != null ? fmt(s.lowestPriceCents) : "—"}
                        </div>
                      </Link>
                    </li>
                  ))}
                </>
              )}

              <li className="border-t border-ink-800">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    submit(e as unknown as React.FormEvent);
                  }}
                  className="w-full px-4 py-2 text-left text-xs text-brand-400 hover:bg-ink-800"
                >
                  See all results for “{value.trim()}” →
                </button>
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
